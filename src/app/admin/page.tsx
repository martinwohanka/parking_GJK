import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import { describeRange, formatDateWithDay, todayString } from '@/lib/time';
import { AppShell } from '@/components/AppShell';
import { AdminNav } from '@/components/AdminNav';

export const dynamic = 'force-dynamic';

function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const body = (
    <div className="card card-pad">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/prihlaseni');
  if (user.role !== 'ADMIN') redirect('/');

  const today = todayString();
  const settings = await getSettings();

  const [
    userCount,
    spotCount,
    activeSpots,
    todayReservations,
    upcomingCount,
    pendingPenalties,
    topOffenders,
  ] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.parkingSpot.count(),
    prisma.parkingSpot.count({ where: { isActive: true } }),
    prisma.reservation.findMany({
      where: { date: today, status: 'ACTIVE' },
      include: { spot: true, user: { include: { plates: true } } },
      orderBy: { startMinute: 'asc' },
    }),
    prisma.reservation.count({ where: { status: 'ACTIVE', date: { gte: today } } }),
    prisma.penaltyReport.count({ where: { status: 'PENDING' } }),
    prisma.penaltyReport.groupBy({
      by: ['targetUserId'],
      where: { status: 'CONFIRMED', targetUserId: { not: null } },
      _sum: { points: true },
      orderBy: { _sum: { points: 'desc' } },
      take: 5,
    }),
  ]);

  const offenderIds = topOffenders
    .map((o) => o.targetUserId)
    .filter((id): id is string => Boolean(id));
  const offenders = offenderIds.length
    ? await prisma.user.findMany({
        where: { id: { in: offenderIds } },
        select: { id: true, name: true, email: true },
      })
    : [];

  return (
    <AppShell user={user} title="Správa parkoviště" subtitle={`Dnes je ${formatDateWithDay(today)}`}>
      <AdminNav />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Aktivní uživatelé" value={userCount} href="/admin/uzivatele" />
        <Stat label="Parkovací místa" value={`${activeSpots} / ${spotCount}`} href="/admin/mista" />
        <Stat label="Nadcházející rezervace" value={upcomingCount} href="/admin/rezervace" />
        <Stat label="Hlášení ke schválení" value={pendingPenalties} href="/admin/prestupky" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="card card-pad">
          <h2 className="section-title mb-3">Dnešní rezervace ({todayReservations.length})</h2>
          {todayReservations.length === 0 ? (
            <p className="text-sm text-slate-500">Na dnešek nejsou žádné rezervace.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Místo</th>
                    <th>Čas</th>
                    <th>Kantor</th>
                    <th>SPZ</th>
                  </tr>
                </thead>
                <tbody>
                  {todayReservations.map((r) => (
                    <tr key={r.id}>
                      <td className="font-semibold">č. {r.spot.code}</td>
                      <td className="whitespace-nowrap">
                        {describeRange(r.startMinute, r.endMinute, r.kind)}
                      </td>
                      <td>
                        {r.user.name}
                        <span className="block text-xs text-slate-400">{r.user.email}</span>
                      </td>
                      <td className="font-mono text-xs">
                        {r.user.plates.map((p) => p.display).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="card card-pad">
            <h2 className="section-title mb-3">Nejvíce trestných bodů</h2>
            {topOffenders.length === 0 ? (
              <p className="text-sm text-slate-500">Zatím nikdo nemá trestné body.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {topOffenders.map((row) => {
                  const person = offenders.find((o) => o.id === row.targetUserId);
                  const points = row._sum.points ?? 0;
                  return (
                    <li key={row.targetUserId} className="flex items-center justify-between gap-2">
                      <span>{person?.name ?? 'Neznámý uživatel'}</span>
                      <span
                        className={`badge ${
                          points >= settings.blockAtPoints
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {points} b.
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="card card-pad text-sm">
            <h2 className="section-title mb-3">Aktuální pravidla</h2>
            <dl className="space-y-1.5">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Týdenní příděl</dt>
                <dd className="font-medium">{settings.weeklyTokens} rezervací</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Max. rezervací na den</dt>
                <dd className="font-medium">{settings.maxPerDay}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Rezervace dopředu</dt>
                <dd className="font-medium">{settings.maxAdvanceDays} dní</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Token za body</dt>
                <dd className="font-medium">á {settings.pointsPerTokenLoss} b.</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Blokace od</dt>
                <dd className="font-medium">{settings.blockAtPoints} b.</dd>
              </div>
            </dl>
            <Link href="/admin/nastaveni" className="btn-secondary btn-sm mt-4 w-full">
              Upravit nastavení
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
