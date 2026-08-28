import { prisma } from '@/lib/prisma';
import {
  daySlots,
  getSettings,
  openDayNumbers,
  overnightRange,
  type AppSettings,
} from '@/lib/settings';
import { getQuota } from '@/lib/tokens';
import {
  MINUTES_PER_DAY,
  absoluteMinute,
  addDays,
  describeRange,
  diffDays,
  formatDateWithDay,
  isValidDateString,
  isoWeekday,
  nowMinutes,
  todayString,
  weekDates,
} from '@/lib/time';

export class ReservationError extends Error {}

export type SlotState = 'FREE' | 'TAKEN' | 'MINE' | 'PAST' | 'CLOSED';

export type SlotCell = {
  startMinute: number;
  endMinute: number;
  state: SlotState;
  reservationId?: string;
  holderName?: string;
  holderId?: string;
};

export type DayRow = {
  date: string;
  weekday: number;
  isOpen: boolean;
  isToday: boolean;
  slots: SlotCell[];
  overnight?: SlotCell;
};

export type SpotWeek = {
  spot: { id: string; code: string; label: string | null; note: string | null; section: string; isActive: boolean };
  days: DayRow[];
  slotStarts: number[];
};

type ReservationLite = {
  id: string;
  date: string;
  startMinute: number;
  endMinute: number;
  userId: string;
  spotId: string;
  user: { name: string };
};

/** Aktivní rezervace, které mohou zasahovat do zadaného rozsahu dní. */
async function loadReservations(
  dates: string[],
  spotIds?: string[],
): Promise<ReservationLite[]> {
  if (dates.length === 0) return [];
  // Noční rezervace ze dne předcházejícího zasahují do prvního dne rozsahu.
  const extended = [addDays(dates[0], -1), ...dates];
  return prisma.reservation.findMany({
    where: {
      status: 'ACTIVE',
      date: { in: extended },
      ...(spotIds ? { spotId: { in: spotIds } } : {}),
    },
    select: {
      id: true,
      date: true,
      startMinute: true,
      endMinute: true,
      userId: true,
      spotId: true,
      user: { select: { name: true } },
    },
  });
}

function findCovering(
  reservations: ReservationLite[],
  spotId: string,
  date: string,
  startMinute: number,
  endMinute: number,
): ReservationLite | undefined {
  const from = absoluteMinute(date, startMinute);
  const to = absoluteMinute(date, endMinute);
  return reservations.find(
    (r) =>
      r.spotId === spotId &&
      absoluteMinute(r.date, r.startMinute) < to &&
      from < absoluteMinute(r.date, r.endMinute),
  );
}

function cellState(
  reservation: ReservationLite | undefined,
  currentUserId: string | undefined,
  isPast: boolean,
): SlotState {
  if (reservation) return reservation.userId === currentUserId ? 'MINE' : 'TAKEN';
  return isPast ? 'PAST' : 'FREE';
}

function isPastSlot(date: string, endMinute: number, today: string, minuteNow: number) {
  const diff = diffDays(today, date);
  if (diff < 0) return true;
  if (diff > 0) return false;
  return endMinute <= minuteNow;
}

/** Týdenní mřížka jednoho parkovacího místa (řádky = dny, sloupce = hodiny). */
export async function getSpotWeek(
  spotId: string,
  weekStart: string,
  currentUserId?: string,
  settings?: AppSettings,
): Promise<SpotWeek | null> {
  const config = settings ?? (await getSettings());
  const spot = await prisma.parkingSpot.findUnique({ where: { id: spotId } });
  if (!spot) return null;

  const dates = weekDates(weekStart);
  const openDays = openDayNumbers(config);
  const slotStarts = daySlots(config);
  const reservations = await loadReservations(dates, [spotId]);
  const today = todayString();
  const minuteNow = nowMinutes();
  const night = overnightRange(config);

  const days: DayRow[] = dates.map((date) => {
    const weekday = isoWeekday(date);
    const isOpen = openDays.includes(weekday);
    const slots: SlotCell[] = slotStarts.map((start) => {
      const end = start + config.slotMinutes;
      if (!isOpen) return { startMinute: start, endMinute: end, state: 'CLOSED' as const };
      const reservation = findCovering(reservations, spotId, date, start, end);
      return {
        startMinute: start,
        endMinute: end,
        state: cellState(reservation, currentUserId, isPastSlot(date, end, today, minuteNow)),
        reservationId: reservation?.id,
        holderName: reservation?.user.name,
        holderId: reservation?.userId,
      };
    });

    let overnight: SlotCell | undefined;
    if (config.allowOvernight && isOpen) {
      const reservation = findCovering(
        reservations,
        spotId,
        date,
        night.startMinute,
        night.endMinute,
      );
      overnight = {
        startMinute: night.startMinute,
        endMinute: night.endMinute,
        state: cellState(
          reservation,
          currentUserId,
          isPastSlot(date, night.endMinute, today, minuteNow),
        ),
        reservationId: reservation?.id,
        holderName: reservation?.user.name,
        holderId: reservation?.userId,
      };
    }

    return { date, weekday, isOpen, isToday: date === today, slots, overnight };
  });

  return { spot, days, slotStarts };
}

export type SpotOverviewDay = {
  date: string;
  isOpen: boolean;
  /** Volné sloty, které je ještě možné rezervovat. */
  freeSlots: number;
  /** Sloty, které ještě nejsou v minulosti (jmenovatel poměru). */
  totalSlots: number;
  /** Celý den už proběhl – obsazenost se nebarví jako „plno“. */
  isPast: boolean;
  hasMine: boolean;
};

export type SpotOverview = {
  spot: { id: string; code: string; label: string | null; section: string; position: number; isActive: boolean; note: string | null };
  days: SpotOverviewDay[];
  freeSlotsTotal: number;
  totalSlotsTotal: number;
};

/** Přehled obsazenosti všech míst pro daný týden (plánek + dlaždice). */
export async function getWeekOverview(
  weekStart: string,
  currentUserId?: string,
  settings?: AppSettings,
): Promise<{ spots: SpotOverview[]; dates: string[] }> {
  const config = settings ?? (await getSettings());
  const spots = await prisma.parkingSpot.findMany({
    orderBy: [{ section: 'asc' }, { position: 'asc' }, { code: 'asc' }],
  });
  const dates = weekDates(weekStart).filter((d) =>
    openDayNumbers(config).includes(isoWeekday(d)),
  );
  const slotStarts = daySlots(config);
  const reservations = await loadReservations(dates, spots.map((s) => s.id));
  const today = todayString();
  const minuteNow = nowMinutes();

  const result: SpotOverview[] = spots.map((spot) => {
    let freeSlotsTotal = 0;
    let totalSlotsTotal = 0;
    const days: SpotOverviewDay[] = dates.map((date) => {
      let free = 0;
      let available = 0;
      let hasMine = false;
      for (const start of slotStarts) {
        const end = start + config.slotMinutes;
        const reservation = findCovering(reservations, spot.id, date, start, end);
        if (reservation?.userId === currentUserId) hasMine = true;
        // Uplynulé sloty se do poměru nepočítají – jinak by volné místo
        // v pátek vypadalo jako obsazené jen kvůli proběhlému pondělí.
        if (isPastSlot(date, end, today, minuteNow)) continue;
        available += 1;
        if (!reservation && spot.isActive) free += 1;
      }
      freeSlotsTotal += free;
      totalSlotsTotal += available;
      return {
        date,
        isOpen: true,
        freeSlots: free,
        totalSlots: available,
        isPast: available === 0,
        hasMine,
      };
    });
    return { spot, days, freeSlotsTotal, totalSlotsTotal };
  });

  result.sort((a, b) => compareSpotCodes(a.spot.code, b.spot.code));
  return { spots: result, dates };
}

/* ------------------------- vytvoření rezervace --------------------------- */

export type CreateReservationInput = {
  spotId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  kind?: string;
  note?: string;
  /** Uživatel, pro kterého se rezervace vytváří. */
  userId: string;
  /** Kdo akci provádí (správce může rezervovat za jiného). */
  actorId: string;
  actorIsAdmin: boolean;
};

export type CreatedReservation = {
  id: string;
  date: string;
  startMinute: number;
  endMinute: number;
  kind: string;
  spotCode: string;
  userEmail: string;
  userName: string;
  remainingTokens: number;
};

function validateWindow(
  input: { date: string; startMinute: number; endMinute: number; kind: string },
  config: AppSettings,
): void {
  const { date, startMinute, endMinute, kind } = input;

  if (!isValidDateString(date)) throw new ReservationError('Neplatné datum.');
  if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute)) {
    throw new ReservationError('Neplatný čas rezervace.');
  }
  if (endMinute <= startMinute) {
    throw new ReservationError('Konec rezervace musí být po jejím začátku.');
  }

  const openDays = openDayNumbers(config);
  if (!openDays.includes(isoWeekday(date))) {
    throw new ReservationError('V tento den se na parkovišti nerezervuje.');
  }

  const night = overnightRange(config);
  if (kind === 'OVERNIGHT') {
    if (!config.allowOvernight) {
      throw new ReservationError('Rezervace přes noc není povolena.');
    }
    if (startMinute !== night.startMinute || endMinute !== night.endMinute) {
      throw new ReservationError('Neplatný rozsah noční rezervace.');
    }
    return;
  }

  if (endMinute > MINUTES_PER_DAY) {
    throw new ReservationError('Denní rezervace nemůže přesáhnout půlnoc.');
  }
  if (startMinute < config.dayStartMinute || endMinute > config.dayEndMinute) {
    throw new ReservationError('Rezervace musí být v rámci provozní doby parkoviště.');
  }
  if (endMinute - startMinute < config.minDurationMinutes) {
    throw new ReservationError(
      `Nejkratší možná rezervace je ${config.minDurationMinutes} minut.`,
    );
  }
  if (
    (startMinute - config.dayStartMinute) % config.slotMinutes !== 0 ||
    (endMinute - config.dayStartMinute) % config.slotMinutes !== 0
  ) {
    throw new ReservationError('Rezervace musí začínat i končit na hranici časového slotu.');
  }
}

/** Vytvoří rezervaci se všemi kontrolami (překryvy, limity, tokeny). */
export async function createReservation(
  input: CreateReservationInput,
): Promise<CreatedReservation> {
  const config = await getSettings();
  const kind = input.kind ?? 'RANGE';
  validateWindow({ ...input, kind }, config);

  const today = todayString();
  const daysAhead = diffDays(today, input.date);
  if (daysAhead < 0) throw new ReservationError('Nelze rezervovat termín v minulosti.');
  if (!input.actorIsAdmin && daysAhead > config.maxAdvanceDays) {
    throw new ReservationError(
      `Rezervovat lze nejvýše ${config.maxAdvanceDays} dní dopředu.`,
    );
  }
  if (daysAhead === 0 && input.endMinute <= nowMinutes() && !input.actorIsAdmin) {
    throw new ReservationError('Tento časový úsek už dnes proběhl.');
  }

  const spot = await prisma.parkingSpot.findUnique({ where: { id: input.spotId } });
  if (!spot) throw new ReservationError('Parkovací místo neexistuje.');
  if (!spot.isActive && !input.actorIsAdmin) {
    throw new ReservationError('Toto parkovací místo je dočasně mimo provoz.');
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, name: true, email: true, isActive: true },
  });
  if (!user || !user.isActive) throw new ReservationError('Uživatel není aktivní.');

  const plateCount = await prisma.plate.count({ where: { userId: user.id } });
  if (plateCount === 0) {
    throw new ReservationError(
      'Před rezervací je nutné mít v profilu uloženou alespoň jednu SPZ.',
    );
  }

  const quota = await getQuota(user.id, input.date, config);
  const tokenCost = input.actorIsAdmin ? 0 : 1;

  if (!input.actorIsAdmin) {
    if (quota.isBlocked) {
      throw new ReservationError(
        `Rezervace je zablokována – máte ${quota.penaltyPoints} trestných bodů. Kontaktujte správce parkoviště.`,
      );
    }
    if (quota.remainingTokens < tokenCost) {
      throw new ReservationError(
        `V tomto týdnu už nemáte volné rezervace (příděl ${quota.totalTokens}, využito ${quota.usedTokens}).`,
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const neighbourDates = [addDays(input.date, -1), input.date, addDays(input.date, 1)];
    const from = absoluteMinute(input.date, input.startMinute);
    const to = absoluteMinute(input.date, input.endMinute);

    const sameSpot = await tx.reservation.findMany({
      where: { spotId: input.spotId, status: 'ACTIVE', date: { in: neighbourDates } },
      select: { date: true, startMinute: true, endMinute: true, user: { select: { name: true } } },
    });
    const clash = sameSpot.find(
      (r) =>
        absoluteMinute(r.date, r.startMinute) < to &&
        from < absoluteMinute(r.date, r.endMinute),
    );
    if (clash) {
      throw new ReservationError(
        `Místo č. ${spot.code} je v tomto čase již rezervováno (${clash.user.name}).`,
      );
    }

    const sameUser = await tx.reservation.findMany({
      where: { userId: user.id, status: 'ACTIVE', date: { in: neighbourDates } },
      select: { date: true, startMinute: true, endMinute: true, spot: { select: { code: true } } },
    });
    const ownClash = sameUser.find(
      (r) =>
        absoluteMinute(r.date, r.startMinute) < to &&
        from < absoluteMinute(r.date, r.endMinute),
    );
    if (ownClash) {
      throw new ReservationError(
        `V tomto čase už máte rezervované místo č. ${ownClash.spot.code}.`,
      );
    }

    if (!input.actorIsAdmin && config.maxPerDay > 0) {
      const perDay = await tx.reservation.count({
        where: { userId: user.id, status: 'ACTIVE', date: input.date },
      });
      if (perDay >= config.maxPerDay) {
        throw new ReservationError(
          `Na jeden den lze mít nejvýše ${config.maxPerDay} rezervaci/e.`,
        );
      }
    }

    const created = await tx.reservation.create({
      data: {
        spotId: input.spotId,
        userId: user.id,
        createdById: input.actorId,
        date: input.date,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        kind,
        note: input.note?.trim() || null,
        tokenCost,
      },
    });

    return {
      id: created.id,
      date: created.date,
      startMinute: created.startMinute,
      endMinute: created.endMinute,
      kind: created.kind,
      spotCode: spot.code,
      userEmail: user.email,
      userName: user.name,
      remainingTokens: Math.max(0, quota.remainingTokens - tokenCost),
    };
  });
}

/** Sloučí sousedící vybrané sloty do co nejmenšího počtu rezervací. */
export function mergeSlots(
  slots: { startMinute: number; endMinute: number }[],
): { startMinute: number; endMinute: number }[] {
  const sorted = [...slots].sort((a, b) => a.startMinute - b.startMinute);
  const merged: { startMinute: number; endMinute: number }[] = [];
  for (const slot of sorted) {
    const last = merged[merged.length - 1];
    if (last && slot.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, slot.endMinute);
    } else {
      merged.push({ ...slot });
    }
  }
  return merged;
}

export function reservationLabel(r: {
  date: string;
  startMinute: number;
  endMinute: number;
  kind: string;
}): string {
  return `${formatDateWithDay(r.date)}, ${describeRange(r.startMinute, r.endMinute, r.kind)}`;
}

/** Řazení míst podle čísla („2“ před „10“), nečíselná označení abecedně. */
export function compareSpotCodes(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b, 'cs');
}
