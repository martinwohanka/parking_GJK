import Link from 'next/link';
import { addDays, formatDateHuman, todayString, startOfWeek } from '@/lib/time';

export function WeekSwitcher({
  weekStart,
  basePath,
  extraQuery = '',
}: {
  weekStart: string;
  basePath: string;
  extraQuery?: string;
}) {
  const prev = addDays(weekStart, -7);
  const next = addDays(weekStart, 7);
  const end = addDays(weekStart, 6);
  const thisWeek = startOfWeek(todayString());
  const q = (date: string) => `${basePath}?tyden=${date}${extraQuery}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={q(prev)} className="btn-secondary btn-sm" aria-label="Předchozí týden">
        ← Předchozí
      </Link>
      <span className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200">
        {formatDateHuman(weekStart)} – {formatDateHuman(end)}
      </span>
      <Link href={q(next)} className="btn-secondary btn-sm" aria-label="Následující týden">
        Následující →
      </Link>
      {weekStart !== thisWeek && (
        <Link href={q(thisWeek)} className="btn-secondary btn-sm">
          Tento týden
        </Link>
      )}
    </div>
  );
}
