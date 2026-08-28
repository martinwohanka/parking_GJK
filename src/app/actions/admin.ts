'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  isMailEnabled,
  penaltyConfirmedMail,
  reservationCancelledMail,
  reservationChangedMail,
  sendMail,
} from '@/lib/mail';
import { formatPlate, isValidPlate, normalizePlate } from '@/lib/plates';
import {
  createReservation,
  reservationLabel,
  ReservationError,
} from '@/lib/reservations';
import { getQuota } from '@/lib/tokens';
import { describeRange, formatDateWithDay, isValidDateString } from '@/lib/time';

export type AdminFormState = { error?: string; success?: string };

async function ensureAdmin(): Promise<{ id: string; name: string } | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') return null;
  return { id: user.id, name: user.name };
}

const DENIED: AdminFormState = { error: 'Tato akce vyžaduje oprávnění správce.' };

function revalidateAdmin() {
  revalidatePath('/admin');
  revalidatePath('/admin/rezervace');
  revalidatePath('/admin/uzivatele');
  revalidatePath('/admin/mista');
  revalidatePath('/admin/prestupky');
  revalidatePath('/');
}

/* ---------------------------- rezervace --------------------------------- */

const timeSchema = z.object({
  id: z.string().min(1),
  date: z.string(),
  start: z.string(),
  end: z.string(),
  spotId: z.string().min(1),
});

function parseHm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 47 || m > 59) return null;
  return h * 60 + m;
}

/** Úprava rezervace správcem (místo, den, čas). */
export async function adminUpdateReservationAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await ensureAdmin();
  if (!admin) return DENIED;

  const parsed = timeSchema.safeParse({
    id: formData.get('id'),
    date: formData.get('date'),
    start: formData.get('start'),
    end: formData.get('end'),
    spotId: formData.get('spotId'),
  });
  if (!parsed.success) return { error: 'Zkontrolujte zadané údaje.' };

  const { id, date, spotId } = parsed.data;
  const startMinute = parseHm(parsed.data.start);
  const endMinute = parseHm(parsed.data.end);

  if (!isValidDateString(date)) return { error: 'Neplatné datum.' };
  if (startMinute === null || endMinute === null) return { error: 'Neplatný čas (formát HH:MM).' };
  if (endMinute <= startMinute) return { error: 'Konec musí být po začátku.' };

  const existing = await prisma.reservation.findUnique({
    where: { id },
    include: { spot: true, user: true },
  });
  if (!existing) return { error: 'Rezervace nebyla nalezena.' };

  const previous = `místo č. ${existing.spot.code}, ${reservationLabel(existing)}`;

  const clash = await prisma.reservation.findFirst({
    where: {
      id: { not: id },
      spotId,
      status: 'ACTIVE',
      date,
      NOT: [{ endMinute: { lte: startMinute } }, { startMinute: { gte: endMinute } }],
    },
    include: { user: true },
  });
  if (clash) {
    return { error: `Kolize s rezervací uživatele ${clash.user.name}.` };
  }

  const spot = await prisma.parkingSpot.findUnique({ where: { id: spotId } });
  if (!spot) return { error: 'Parkovací místo neexistuje.' };

  await prisma.reservation.update({
    where: { id },
    data: { date, startMinute, endMinute, spotId, kind: 'RANGE' },
  });

  await sendMail(
    reservationChangedMail({
      userName: existing.user.name,
      userEmail: existing.user.email,
      spotCode: spot.code,
      dateLabel: formatDateWithDay(date),
      timeLabel: describeRange(startMinute, endMinute),
      previous,
    }),
  );

  revalidateAdmin();
  return {
    success: isMailEnabled()
      ? 'Rezervace byla upravena a uživateli odeslán e-mail.'
      : 'Rezervace byla upravena. E-maily nejsou nastavené, uživatele informujte sám/sama.',
  };
}

export async function adminCancelReservationAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await ensureAdmin();
  if (!admin) return DENIED;

  const id = String(formData.get('id') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { spot: true, user: true },
  });
  if (!reservation) return { error: 'Rezervace nebyla nalezena.' };
  if (reservation.status !== 'ACTIVE') return { error: 'Rezervace už je zrušená.' };

  await prisma.reservation.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelledReason: reason || `Zrušeno správcem (${admin.name})`,
    },
  });

  await sendMail(
    reservationCancelledMail({
      userName: reservation.user.name,
      userEmail: reservation.user.email,
      spotCode: reservation.spot.code,
      dateLabel: formatDateWithDay(reservation.date),
      timeLabel: describeRange(reservation.startMinute, reservation.endMinute, reservation.kind),
      byAdmin: true,
      reason: reason || undefined,
    }),
  );

  revalidateAdmin();
  return {
    success: isMailEnabled()
      ? 'Rezervace byla zrušena a uživateli odeslán e-mail.'
      : 'Rezervace byla zrušena. E-maily nejsou nastavené, uživatele informujte sám/sama.',
  };
}

/** Vytvoření rezervace správcem jménem kantora (nečerpá tokeny). */
export async function adminCreateReservationAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await ensureAdmin();
  if (!admin) return DENIED;

  const userId = String(formData.get('userId') ?? '');
  const spotId = String(formData.get('spotId') ?? '');
  const date = String(formData.get('date') ?? '');
  const startMinute = parseHm(String(formData.get('start') ?? ''));
  const endMinute = parseHm(String(formData.get('end') ?? ''));
  const note = String(formData.get('note') ?? '').trim();

  if (startMinute === null || endMinute === null) {
    return { error: 'Neplatný čas (formát HH:MM).' };
  }

  try {
    const result = await createReservation({
      spotId,
      userId,
      actorId: admin.id,
      actorIsAdmin: true,
      date,
      startMinute,
      endMinute,
      kind: endMinute > 1440 ? 'OVERNIGHT' : 'RANGE',
      note: note || 'Založeno správcem',
    });
    revalidateAdmin();
    return {
      success: `Rezervace vytvořena: ${result.userName}, místo č. ${result.spotCode}, ${formatDateWithDay(result.date)}.`,
    };
  } catch (error) {
    return {
      error:
        error instanceof ReservationError
          ? error.message
          : 'Rezervaci se nepodařilo vytvořit.',
    };
  }
}

/* ---------------------------- uživatelé --------------------------------- */

export async function adminUpdateUserAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await ensureAdmin();
  if (!admin) return DENIED;

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const role = String(formData.get('role') ?? 'TEACHER');
  const isActive = formData.get('isActive') === 'on';

  if (name.length < 3) return { error: 'Jméno musí mít alespoň 3 znaky.' };
  if (!['TEACHER', 'ADMIN'].includes(role)) return { error: 'Neplatná role.' };

  if (id === admin.id && (role !== 'ADMIN' || !isActive)) {
    return { error: 'Nemůžete si odebrat vlastní správcovská práva.' };
  }
  if (role !== 'ADMIN') {
    const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (target?.role === 'ADMIN' && admins <= 1) {
      return { error: 'V systému musí zůstat alespoň jeden správce.' };
    }
  }

  await prisma.user.update({ where: { id }, data: { name, role, isActive } });
  revalidateAdmin();
  return { success: 'Uživatel byl upraven.' };
}

export async function adminAdjustTokensAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await ensureAdmin();
  if (!admin) return DENIED;

  const userId = String(formData.get('userId') ?? '');
  const amount = Number(formData.get('amount'));
  const reason = String(formData.get('reason') ?? '').trim();

  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 20) {
    return { error: 'Zadejte celé číslo v rozsahu −20 až 20 (kromě nuly).' };
  }

  await prisma.tokenAdjustment.create({
    data: { userId, amount, reason: reason || null },
  });
  revalidateAdmin();
  return {
    success: `Týdenní příděl uživatele upraven o ${amount > 0 ? `+${amount}` : amount}.`,
  };
}

export async function adminResetPasswordAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await ensureAdmin();
  if (!admin) return DENIED;

  const id = String(formData.get('id') ?? '');
  const password = String(formData.get('password') ?? '');
  if (password.length < 8) return { error: 'Heslo musí mít alespoň 8 znaků.' };

  await prisma.user.update({ where: { id }, data: { passwordHash: hashPassword(password) } });
  return { success: 'Heslo bylo nastaveno. Předejte je uživateli bezpečnou cestou.' };
}

export async function adminAddPlateAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await ensureAdmin();
  if (!admin) return DENIED;

  const userId = String(formData.get('userId') ?? '');
  const input = String(formData.get('plate') ?? '');
  if (!isValidPlate(input)) return { error: 'SPZ musí mít 5–10 znaků.' };

  const plate = normalizePlate(input);
  if (await prisma.plate.findUnique({ where: { plate }, select: { id: true } })) {
    return { error: 'Tato SPZ je již evidovaná.' };
  }

  await prisma.plate.create({ data: { plate, display: formatPlate(input), userId } });
  revalidateAdmin();
  return { success: `SPZ ${formatPlate(input)} přidána.` };
}

export async function adminRemovePlateAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await ensureAdmin();
  if (!admin) return DENIED;

  const id = String(formData.get('id') ?? '');
  await prisma.plate.delete({ where: { id } }).catch(() => null);
  revalidateAdmin();
  return { success: 'SPZ odebrána.' };
}

/* ------------------------- parkovací místa ------------------------------ */

export async function adminSaveSpotAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await ensureAdmin();
  if (!admin) return DENIED;

  const id = String(formData.get('id') ?? '');
  const code = String(formData.get('code') ?? '').trim();
  const label = String(formData.get('label') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const section = String(formData.get('section') ?? 'RIGHT');
  const position = Number(formData.get('position') ?? 0);
  const isActive = formData.get('isActive') === 'on';

  if (!code) return { error: 'Zadejte označení místa.' };
  if (!['LEFT', 'RIGHT'].includes(section)) return { error: 'Neplatná sekce.' };
  if (!Number.isInteger(position) || position < 0 || position > 99) {
    return { error: 'Pořadí musí být číslo 0–99.' };
  }

  const duplicate = await prisma.parkingSpot.findUnique({
    where: { code },
    select: { id: true },
  });
  if (duplicate && duplicate.id !== id) {
    return { error: `Místo s označením „${code}“ už existuje.` };
  }

  const data = {
    code,
    label: label || null,
    note: note || null,
    section,
    position,
    isActive,
  };

  if (id) await prisma.parkingSpot.update({ where: { id }, data });
  else await prisma.parkingSpot.create({ data });

  revalidateAdmin();
  return { success: id ? 'Místo bylo upraveno.' : `Místo č. ${code} bylo přidáno.` };
}

export async function adminDeleteSpotAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await ensureAdmin();
  if (!admin) return DENIED;

  const id = String(formData.get('id') ?? '');
  const active = await prisma.reservation.count({
    where: { spotId: id, status: 'ACTIVE' },
  });
  if (active > 0) {
    return {
      error: `Místo má ${active} aktivních rezervací. Nejprve je zrušte, nebo místo jen deaktivujte.`,
    };
  }
  await prisma.parkingSpot.delete({ where: { id } }).catch(() => null);
  revalidateAdmin();
  return { success: 'Místo bylo smazáno.' };
}

/* --------------------------- trestné body ------------------------------- */

export async function adminResolvePenaltyAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await ensureAdmin();
  if (!admin) return DENIED;

  const id = String(formData.get('id') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const points = Number(formData.get('points') ?? 1);
  const note = String(formData.get('note') ?? '').trim();

  if (!['CONFIRMED', 'REJECTED'].includes(decision)) return { error: 'Neplatné rozhodnutí.' };
  if (decision === 'CONFIRMED' && (!Number.isInteger(points) || points < 1 || points > 10)) {
    return { error: 'Počet bodů musí být 1–10.' };
  }

  const report = await prisma.penaltyReport.findUnique({
    where: { id },
    include: { targetUser: true },
  });
  if (!report) return { error: 'Nahlášení nebylo nalezeno.' };

  // Pokud SPZ v mezidobí někdo zaregistroval, dohledáme majitele znovu.
  let targetUserId = report.targetUserId;
  if (!targetUserId) {
    const owner = await prisma.plate.findUnique({
      where: { plate: report.plate },
      select: { userId: true },
    });
    targetUserId = owner?.userId ?? null;
  }

  await prisma.penaltyReport.update({
    where: { id },
    data: {
      status: decision,
      points: decision === 'CONFIRMED' ? points : report.points,
      resolutionNote: note || null,
      resolvedById: admin.id,
      resolvedAt: new Date(),
      targetUserId,
    },
  });

  if (decision === 'CONFIRMED' && targetUserId) {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { name: true, email: true },
    });
    if (target) {
      const quota = await getQuota(targetUserId);
      await sendMail(
        penaltyConfirmedMail({
          userName: target.name,
          userEmail: target.email,
          plate: report.plateInput,
          points,
          reason: report.reason,
          totalPoints: quota.penaltyPoints,
          tokensPerWeek: quota.totalTokens,
          blocked: quota.isBlocked,
        }),
      );
    }
  }

  revalidateAdmin();
  return {
    success:
      decision === 'CONFIRMED'
        ? targetUserId
          ? isMailEnabled()
            ? 'Trestné body byly připsány a uživatel informován e-mailem.'
            : 'Trestné body byly připsány. E-maily nejsou nastavené, uživatele informujte sám/sama.'
          : 'Nahlášení potvrzeno. SPZ zatím není přiřazena žádnému uživateli.'
        : 'Nahlášení bylo zamítnuto.',
  };
}

/* ----------------------------- nastavení -------------------------------- */

const settingsSchema = z.object({
  dayStart: z.string(),
  dayEnd: z.string(),
  slotMinutes: z.coerce.number().int().min(15).max(240),
  openDays: z.array(z.string()).min(1, 'Vyberte alespoň jeden den.'),
  maxAdvanceDays: z.coerce.number().int().min(1).max(365),
  weeklyTokens: z.coerce.number().int().min(0).max(50),
  maxPerDay: z.coerce.number().int().min(0).max(10),
  minDurationMinutes: z.coerce.number().int().min(15).max(1440),
  allowOvernight: z.boolean(),
  allowAllDay: z.boolean(),
  pointsPerTokenLoss: z.coerce.number().int().min(0).max(50),
  blockAtPoints: z.coerce.number().int().min(0).max(200),
  penaltyDecayDays: z.coerce.number().int().min(1).max(3650),
  noticeText: z.string().max(2000),
});

export async function adminSaveSettingsAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await ensureAdmin();
  if (!admin) return DENIED;

  const parsed = settingsSchema.safeParse({
    dayStart: formData.get('dayStart'),
    dayEnd: formData.get('dayEnd'),
    slotMinutes: formData.get('slotMinutes'),
    openDays: formData.getAll('openDays').map(String),
    maxAdvanceDays: formData.get('maxAdvanceDays'),
    weeklyTokens: formData.get('weeklyTokens'),
    maxPerDay: formData.get('maxPerDay'),
    minDurationMinutes: formData.get('minDurationMinutes'),
    allowOvernight: formData.get('allowOvernight') === 'on',
    allowAllDay: formData.get('allowAllDay') === 'on',
    pointsPerTokenLoss: formData.get('pointsPerTokenLoss'),
    blockAtPoints: formData.get('blockAtPoints'),
    penaltyDecayDays: formData.get('penaltyDecayDays'),
    noticeText: formData.get('noticeText') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Zkontrolujte zadané údaje.' };
  }

  const dayStartMinute = parseHm(parsed.data.dayStart);
  const dayEndMinute = parseHm(parsed.data.dayEnd);
  if (dayStartMinute === null || dayEndMinute === null) {
    return { error: 'Neplatný čas provozní doby.' };
  }
  if (dayEndMinute <= dayStartMinute) {
    return { error: 'Konec provozní doby musí být po jejím začátku.' };
  }
  if (dayEndMinute - dayStartMinute < parsed.data.slotMinutes) {
    return { error: 'Provozní doba musí být delší než jeden časový slot.' };
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {
      dayStartMinute,
      dayEndMinute,
      slotMinutes: parsed.data.slotMinutes,
      openDays: parsed.data.openDays.join(','),
      maxAdvanceDays: parsed.data.maxAdvanceDays,
      weeklyTokens: parsed.data.weeklyTokens,
      maxPerDay: parsed.data.maxPerDay,
      minDurationMinutes: parsed.data.minDurationMinutes,
      allowOvernight: parsed.data.allowOvernight,
      allowAllDay: parsed.data.allowAllDay,
      pointsPerTokenLoss: parsed.data.pointsPerTokenLoss,
      blockAtPoints: parsed.data.blockAtPoints,
      penaltyDecayDays: parsed.data.penaltyDecayDays,
      noticeText: parsed.data.noticeText.trim() || null,
    },
    create: { id: 1 },
  });

  revalidateAdmin();
  revalidatePath('/admin/nastaveni');
  return { success: 'Nastavení bylo uloženo.' };
}
