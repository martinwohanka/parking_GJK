import { prisma } from '@/lib/prisma';

/**
 * Omezení pokusů o přihlášení.
 *
 * Aplikace je veřejně dostupná na internetu, takže bez tohoto omezení by
 * šlo hesla hádat neomezeně rychle. Počítadlo je v databázi, aby fungovalo
 * i tehdy, když aplikaci obsluhuje víc serverů zároveň.
 */
const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 10;

function windowStart(): Date {
  return new Date(Date.now() - WINDOW_MINUTES * 60_000);
}

export const LOGIN_WINDOW_MINUTES = WINDOW_MINUTES;

/** Kolik minut zbývá do odemčení, nebo 0 když uzamčeno není. */
export async function loginLockMinutesLeft(identifier: string): Promise<number> {
  const attempts = await prisma.loginAttempt.findMany({
    where: { identifier, createdAt: { gte: windowStart() } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  if (attempts.length < MAX_ATTEMPTS) return 0;

  const oldest = attempts[attempts.length - MAX_ATTEMPTS].createdAt.getTime();
  const unlockAt = oldest + WINDOW_MINUTES * 60_000;
  return Math.max(1, Math.ceil((unlockAt - Date.now()) / 60_000));
}

export async function recordFailedLogin(identifier: string): Promise<void> {
  await prisma.loginAttempt.create({ data: { identifier } });
  // Průběžný úklid, ať tabulka neroste donekonečna.
  await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 24 * 3_600_000) } },
  });
}

export async function clearLoginAttempts(identifier: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { identifier } });
}
