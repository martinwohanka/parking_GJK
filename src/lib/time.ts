/**
 * Práce s datem a časem.
 *
 * Datum je v celé aplikaci reprezentováno řetězcem "YYYY-MM-DD" v lokálním
 * čase školy (Europe/Prague) a čas počtem minut od půlnoci daného dne.
 * Noční rezervace mají endMinute > 1440 (zasahují do následujícího dne).
 * Díky tomu jsou všechny výpočty překryvů čistě aritmetické.
 */

export const TIME_ZONE = 'Europe/Prague';
export const MINUTES_PER_DAY = 1440;

export const DAY_NAMES_SHORT = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
export const DAY_NAMES_LONG = [
  'pondělí',
  'úterý',
  'středa',
  'čtvrtek',
  'pátek',
  'sobota',
  'neděle',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

/** Dnešní datum ve škole (Europe/Prague) jako "YYYY-MM-DD". */
export function todayString(now: Date = new Date()): string {
  return formatDateInZone(now);
}

/** Aktuální počet minut od půlnoci ve škole. */
export function nowMinutes(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

function formatDateInZone(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return parts; // en-CA dává tvar YYYY-MM-DD
}

/** Počet dní od 1970-01-01 – používá se pro aritmetiku bez časových zón. */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function dateFromDayNumber(day: number): string {
  const dt = new Date(day * 86_400_000);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: string, days: number): string {
  return dateFromDayNumber(dayNumber(date) + days);
}

export function diffDays(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** ISO číslo dne v týdnu: 1 = pondělí … 7 = neděle. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = neděle
  return wd === 0 ? 7 : wd;
}

/** Pondělí týdne, do kterého datum spadá. */
export function startOfWeek(date: string): string {
  return addDays(date, -(isoWeekday(date) - 1));
}

/** Klíč kalendářního týdne ve tvaru "2026-W09" – používá se pro tokeny. */
export function weekKey(date: string): string {
  const monday = startOfWeek(date);
  const [y, m, d] = monday.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  // ISO týden: čtvrtek téhož týdne určuje rok
  target.setUTCDate(target.getUTCDate() + 3);
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstMonday = new Date(firstThursday);
  firstMonday.setUTCDate(
    firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7),
  );
  const week =
    1 + Math.round((target.getTime() - firstMonday.getTime()) / (7 * 86_400_000)) - 1;
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** Dny pondělí–neděle daného týdne. */
export function weekDates(anyDateInWeek: string): string[] {
  const monday = startOfWeek(anyDateInWeek);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function formatMinute(minute: number): string {
  const normalized = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDateHuman(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${d}. ${m}. ${y}`;
}

export function formatDateWithDay(date: string): string {
  return `${DAY_NAMES_SHORT[isoWeekday(date) - 1]} ${formatDateHuman(date)}`;
}

/** Absolutní minuta od epochy – pro porovnávání překryvů napříč dny. */
export function absoluteMinute(date: string, minute: number): number {
  return dayNumber(date) * MINUTES_PER_DAY + minute;
}

export interface Interval {
  date: string;
  startMinute: number;
  endMinute: number;
}

export function overlaps(a: Interval, b: Interval): boolean {
  const aStart = absoluteMinute(a.date, a.startMinute);
  const aEnd = absoluteMinute(a.date, a.endMinute);
  const bStart = absoluteMinute(b.date, b.startMinute);
  const bEnd = absoluteMinute(b.date, b.endMinute);
  return aStart < bEnd && bStart < aEnd;
}

/** Popis časového rozsahu, např. „7:00–16:00“ nebo „16:00–7:00 (přes noc)“. */
export function describeRange(
  startMinute: number,
  endMinute: number,
  kind?: string,
): string {
  const base = `${formatMinute(startMinute)}–${formatMinute(endMinute)}`;
  if (kind === 'ALL_DAY') return `${base} (celý den)`;
  if (endMinute > MINUTES_PER_DAY) return `${base} (přes noc)`;
  return base;
}
