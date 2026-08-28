import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getSpotWeek } from '@/lib/reservations';
import { getSettings } from '@/lib/settings';
import { getQuota } from '@/lib/tokens';
import {
  formatMinute,
  isValidDateString,
  startOfWeek,
  todayString,
} from '@/lib/time';
import { AppShell } from '@/components/AppShell';
import { Alert } from '@/components/Alert';
import { ReservationGrid } from '@/components/ReservationGrid';
import { WeekSwitcher } from '@/components/WeekSwitcher';

export const dynamic = 'force-dynamic';

export default async function SpotPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ tyden?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/prihlaseni');

  const { code } = await params;
  const query = await searchParams;
  const weekStart = startOfWeek(
    query.tyden && isValidDateString(query.tyden) ? query.tyden : todayString(),
  );

  const spot = await prisma.parkingSpot.findUnique({
    where: { code: decodeURIComponent(code) },
  });
  if (!spot) notFound();

  const settings = await getSettings();
  const [week, quota, plateCount] = await Promise.all([
    getSpotWeek(spot.id, weekStart, user.id, settings),
    getQuota(user.id, weekStart, settings),
    prisma.plate.count({ where: { userId: user.id } }),
  ]);
  if (!week) notFound();

  const blockedReason = quota.isBlocked
    ? `Rezervace jsou zablokovány kvůli ${quota.penaltyPoints} trestným bodům. Obraťte se na správce.`
    : plateCount === 0
      ? 'Nemáte uloženou žádnou SPZ – doplňte ji v profilu, jinak rezervaci nelze vytvořit.'
      : !spot.isActive
        ? 'Toto místo je dočasně mimo provoz, rezervace nejsou možné.'
        : quota.remainingTokens === 0
          ? 'V tomto týdnu už nemáte volné rezervace. Zkuste jiný týden.'
          : undefined;

  const canReserve =
    !quota.isBlocked && plateCount > 0 && spot.isActive && quota.remainingTokens > 0;

  return (
    <AppShell
      user={user}
      title={`Parkovací místo č. ${spot.code}`}
      subtitle={[
        spot.label,
        `provozní doba ${formatMinute(settings.dayStartMinute)}–${formatMinute(settings.dayEndMinute)}`,
      ]
        .filter(Boolean)
        .join(' • ')}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/?tyden=${weekStart}`} className="btn-secondary btn-sm">
            ← Zpět na plánek
          </Link>
          <WeekSwitcher weekStart={weekStart} basePath={`/misto/${encodeURIComponent(spot.code)}`} />
        </div>
      }
    >
      {spot.note && <Alert kind="info">{spot.note}</Alert>}

      <ReservationGrid
        spotId={spot.id}
        spotCode={spot.code}
        days={week.days}
        slotStarts={week.slotStarts}
        canReserve={canReserve}
        blockedReason={blockedReason}
        remainingTokens={quota.remainingTokens}
        allowAllDay={settings.allowAllDay}
        allowOvernight={settings.allowOvernight}
      />
    </AppShell>
  );
}
