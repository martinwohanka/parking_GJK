import { prisma } from '@/lib/prisma';
import { getSettings, type AppSettings } from '@/lib/settings';
import { addDays, todayString, weekDates, weekKey } from '@/lib/time';

export type QuotaInfo = {
  /** Základní týdenní příděl z nastavení. */
  baseTokens: number;
  /** Ruční úprava (bonus/malus) od správce. */
  adjustment: number;
  /** Odebráno kvůli trestným bodům. */
  penaltyLoss: number;
  /** Kolik tokenů má uživatel v daném týdnu k dispozici celkem. */
  totalTokens: number;
  /** Kolik už jich v týdnu použil. */
  usedTokens: number;
  /** Kolik mu jich zbývá. */
  remainingTokens: number;
  /** Aktivní (nevypršelé, potvrzené) trestné body. */
  penaltyPoints: number;
  /** Uživatel je kvůli trestným bodům zablokován. */
  isBlocked: boolean;
  weekKey: string;
};

/** Počet aktivních (nevypršelých) potvrzených trestných bodů uživatele. */
export async function getActivePenaltyPoints(
  userId: string,
  settings?: AppSettings,
): Promise<number> {
  const config = settings ?? (await getSettings());
  const since = new Date(Date.now() - config.penaltyDecayDays * 86_400_000);
  const rows = await prisma.penaltyReport.findMany({
    where: {
      targetUserId: userId,
      status: 'CONFIRMED',
      occurredAt: { gte: since },
    },
    select: { points: true },
  });
  return rows.reduce((sum, r) => sum + r.points, 0);
}

/**
 * Spočítá týdenní příděl rezervací („tokenů“) pro uživatele.
 *
 * Vstupní kritéria pro rezervaci:
 *  - základní příděl z nastavení (výchozí 5 rezervací / kalendářní týden),
 *  - ± ruční úprava od správce,
 *  - − 1 token za každých `pointsPerTokenLoss` aktivních trestných bodů,
 *  - při dosažení `blockAtPoints` je rezervace zcela zablokována.
 */
export async function getQuota(
  userId: string,
  dateInWeek: string = todayString(),
  settings?: AppSettings,
): Promise<QuotaInfo> {
  const config = settings ?? (await getSettings());
  const penaltyPoints = await getActivePenaltyPoints(userId, config);

  const adjustments = await prisma.tokenAdjustment.findMany({
    where: { userId },
    select: { amount: true },
  });
  const adjustment = adjustments.reduce((sum, a) => sum + a.amount, 0);

  const penaltyLoss =
    config.pointsPerTokenLoss > 0
      ? Math.floor(penaltyPoints / config.pointsPerTokenLoss)
      : 0;

  const isBlocked = config.blockAtPoints > 0 && penaltyPoints >= config.blockAtPoints;

  const totalTokens = isBlocked
    ? 0
    : Math.max(0, config.weeklyTokens + adjustment - penaltyLoss);

  const dates = weekDates(dateInWeek);
  const usedTokens = await usedTokensInWeek(userId, dates);

  return {
    baseTokens: config.weeklyTokens,
    adjustment,
    penaltyLoss,
    totalTokens,
    usedTokens,
    remainingTokens: Math.max(0, totalTokens - usedTokens),
    penaltyPoints,
    isBlocked,
    weekKey: weekKey(dateInWeek),
  };
}

async function usedTokensInWeek(userId: string, dates: string[]): Promise<number> {
  const rows = await prisma.reservation.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      date: { in: dates },
    },
    select: { tokenCost: true },
  });
  return rows.reduce((sum, r) => sum + r.tokenCost, 0);
}

/** Přehled kvót pro následujících několik týdnů (pro stránku „Moje rezervace“). */
export async function getUpcomingQuotas(
  userId: string,
  weeks = 2,
): Promise<QuotaInfo[]> {
  const settings = await getSettings();
  const today = todayString();
  const result: QuotaInfo[] = [];
  for (let i = 0; i < weeks; i += 1) {
    result.push(await getQuota(userId, addDays(today, i * 7), settings));
  }
  return result;
}
