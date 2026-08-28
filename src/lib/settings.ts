import { prisma } from '@/lib/prisma';
import { MINUTES_PER_DAY } from '@/lib/time';

export type AppSettings = {
  id: number;
  dayStartMinute: number;
  dayEndMinute: number;
  slotMinutes: number;
  openDays: string;
  maxAdvanceDays: number;
  weeklyTokens: number;
  maxPerDay: number;
  minDurationMinutes: number;
  allowOvernight: boolean;
  allowAllDay: boolean;
  pointsPerTokenLoss: number;
  blockAtPoints: number;
  penaltyDecayDays: number;
  noticeText: string | null;
};

/** Načte (a případně založí) jediný řádek s nastavením. */
export async function getSettings(): Promise<AppSettings> {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (existing) return existing as AppSettings;
  const created = await prisma.settings.create({ data: { id: 1 } });
  return created as AppSettings;
}

export function openDayNumbers(settings: Pick<AppSettings, 'openDays'>): number[] {
  return settings.openDays
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v >= 1 && v <= 7);
}

/** Začátky slotů provozní doby (v minutách od půlnoci). */
export function daySlots(
  settings: Pick<AppSettings, 'dayStartMinute' | 'dayEndMinute' | 'slotMinutes'>,
): number[] {
  const slots: number[] = [];
  const step = Math.max(15, settings.slotMinutes);
  for (let m = settings.dayStartMinute; m + step <= settings.dayEndMinute; m += step) {
    slots.push(m);
  }
  return slots;
}

/** Noční slot: od konce provozní doby do začátku provozní doby dalšího dne. */
export function overnightRange(
  settings: Pick<AppSettings, 'dayStartMinute' | 'dayEndMinute'>,
): { startMinute: number; endMinute: number } {
  return {
    startMinute: settings.dayEndMinute,
    endMinute: MINUTES_PER_DAY + settings.dayStartMinute,
  };
}
