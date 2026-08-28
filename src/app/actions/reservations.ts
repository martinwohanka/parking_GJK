'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  createReservation,
  mergeSlots,
  reservationLabel,
  ReservationError,
} from '@/lib/reservations';
import { getQuota } from '@/lib/tokens';
import {
  reservationCancelledMail,
  reservationCreatedMail,
  reservationsSummaryMail,
  sendMail,
} from '@/lib/mail';
import { describeRange, formatDateWithDay, todayString } from '@/lib/time';

export type ReservationFormState = { error?: string; success?: string };

const selectionSchema = z.array(
  z.object({
    date: z.string(),
    startMinute: z.number().int(),
    endMinute: z.number().int(),
    kind: z.enum(['RANGE', 'ALL_DAY', 'OVERNIGHT']).optional(),
  }),
);

/**
 * Vytvoří rezervace z vybraných slotů. Navazující sloty ve stejném dni
 * se sloučí do jedné rezervace (a stojí jeden token).
 */
export async function createReservationsAction(
  _prev: ReservationFormState,
  formData: FormData,
): Promise<ReservationFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Nejste přihlášeni.' };

  const spotId = String(formData.get('spotId') ?? '');
  const note = String(formData.get('note') ?? '').trim();

  let selections: z.infer<typeof selectionSchema>;
  try {
    selections = selectionSchema.parse(JSON.parse(String(formData.get('selections') ?? '[]')));
  } catch {
    return { error: 'Neplatný výběr časových slotů.' };
  }
  if (selections.length === 0) {
    return { error: 'Vyberte alespoň jeden časový slot.' };
  }

  // Seskupení podle dne a druhu, sloučení navazujících slotů.
  const groups = new Map<string, typeof selections>();
  for (const item of selections) {
    const key = `${item.date}|${item.kind ?? 'RANGE'}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const blocks: { date: string; startMinute: number; endMinute: number; kind: string }[] = [];
  for (const [key, items] of groups) {
    const [date, kind] = key.split('|');
    if (kind === 'OVERNIGHT') {
      for (const item of items) {
        blocks.push({ date, kind, startMinute: item.startMinute, endMinute: item.endMinute });
      }
      continue;
    }
    for (const merged of mergeSlots(items)) {
      blocks.push({ date, kind, ...merged });
    }
  }
  blocks.sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute);

  if (blocks.length > 20) {
    return { error: 'Najednou lze vytvořit nejvýše 20 rezervací.' };
  }

  const created: { spotCode: string; dateLabel: string; timeLabel: string }[] = [];
  let lastRemaining = 0;

  for (const block of blocks) {
    try {
      const result = await createReservation({
        spotId,
        userId: user.id,
        actorId: user.id,
        actorIsAdmin: false,
        date: block.date,
        startMinute: block.startMinute,
        endMinute: block.endMinute,
        kind: block.kind,
        note,
      });
      lastRemaining = result.remainingTokens;
      created.push({
        spotCode: result.spotCode,
        dateLabel: formatDateWithDay(result.date),
        timeLabel: describeRange(result.startMinute, result.endMinute, result.kind),
      });
    } catch (error) {
      const message =
        error instanceof ReservationError
          ? error.message
          : 'Rezervaci se nepodařilo vytvořit.';
      if (created.length > 0) {
        await notifyCreated(user.name, user.email, created, lastRemaining);
        revalidatePath('/');
        revalidatePath('/rezervace');
        return {
          error: `Vytvořeno ${created.length} rezervací, další už ne: ${message}`,
        };
      }
      return { error: message };
    }
  }

  await notifyCreated(user.name, user.email, created, lastRemaining);
  revalidatePath('/');
  revalidatePath('/rezervace');

  return {
    success:
      created.length === 1
        ? `Rezervace potvrzena: místo č. ${created[0].spotCode}, ${created[0].dateLabel}, ${created[0].timeLabel}. Potvrzení jsme poslali na ${user.email}.`
        : `Potvrzeno ${created.length} rezervací. Souhrn jsme poslali na ${user.email}.`,
  };
}

async function notifyCreated(
  userName: string,
  userEmail: string,
  items: { spotCode: string; dateLabel: string; timeLabel: string }[],
  tokensLeft: number,
) {
  if (items.length === 0) return;
  if (items.length === 1) {
    await sendMail(
      reservationCreatedMail({
        userName,
        userEmail,
        spotCode: items[0].spotCode,
        dateLabel: items[0].dateLabel,
        timeLabel: items[0].timeLabel,
        tokensLeft,
      }),
    );
    return;
  }
  await sendMail(reservationsSummaryMail({ userName, userEmail, items, tokensLeft }));
}

/** Zrušení rezervace vlastníkem (správce ruší přes administraci). */
export async function cancelReservationAction(
  _prev: ReservationFormState,
  formData: FormData,
): Promise<ReservationFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Nejste přihlášeni.' };

  const id = String(formData.get('id') ?? '');
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { spot: true, user: true },
  });
  if (!reservation) return { error: 'Rezervace nebyla nalezena.' };

  const isOwner = reservation.userId === user.id;
  if (!isOwner && user.role !== 'ADMIN') {
    return { error: 'Tuto rezervaci nemůžete zrušit.' };
  }
  if (reservation.status !== 'ACTIVE') {
    return { error: 'Rezervace už byla zrušena.' };
  }

  await prisma.reservation.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelledReason: isOwner ? 'Zrušeno uživatelem' : 'Zrušeno správcem',
    },
  });

  await sendMail(
    reservationCancelledMail({
      userName: reservation.user.name,
      userEmail: reservation.user.email,
      spotCode: reservation.spot.code,
      dateLabel: formatDateWithDay(reservation.date),
      timeLabel: describeRange(reservation.startMinute, reservation.endMinute, reservation.kind),
      byAdmin: !isOwner,
    }),
  );

  revalidatePath('/');
  revalidatePath('/rezervace');
  revalidatePath('/admin/rezervace');

  return {
    success: `Rezervace ${reservationLabel(reservation)} byla zrušena.`,
  };
}

/** Vrátí kvótu pro daný týden – používá se pro živý přepočet v mřížce. */
export async function getQuotaForWeek(date: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  return getQuota(user.id, date || todayString());
}
