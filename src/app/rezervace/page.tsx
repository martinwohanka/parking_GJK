import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUpcomingQuotas } from '@/lib/tokens';
import { describeRange, formatDateWithDay, todayString } from '@/lib/time';
import { AppShell } from '@/components/AppShell';
import { QuotaCard } from '@/components/QuotaCard';
import { CancelReservationButton } from '@/components/CancelReservationButton';

export const dynamic = 'force-dynamic';

export default async function MyReservationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/prihlaseni');

  const today = todayString();
  const [reservations, quotas] = await Promise.all([
    prisma.reservation.findMany({
      where: { userId: user.id },
      include: { spot: true },
      orderBy: [{ date: 'desc' }, { startMinute: 'desc' }],
      take: 200,
    }),
    getUpcomingQuotas(user.id, 2),
  ]);

  const upcoming = reservations.filter((r) => r.status === 'ACTIVE' && r.date >= today);
  const past = reservations.filter((r) => r.status !== 'ACTIVE' || r.date < today);

  return (
    <AppShell
      user={user}
      title="Moje rezervace"
      subtitle="Přehled nadcházejících i proběhlých rezervací"
      actions={
        <Link href="/" className="btn-primary btn-sm">
          Nová rezervace
        </Link>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <div className="card card-pad">
            <h2 className="section-title mb-3">Nadcházející ({upcoming.length})</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nemáte žádnou nadcházející rezervaci.{' '}
                <Link href="/" className="font-medium text-brand-700 hover:underline">
                  Vybrat místo
                </Link>
              </p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Místo č. {r.spot.code} • {formatDateWithDay(r.date)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {describeRange(r.startMinute, r.endMinute, r.kind)}
                        {r.note ? ` • ${r.note}` : ''}
                        {r.tokenCost === 0 ? ' • založeno správcem' : ''}
                      </p>
                    </div>
                    <CancelReservationButton id={r.id} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card card-pad">
            <h2 className="section-title mb-3">Historie</h2>
            {past.length === 0 ? (
              <p className="text-sm text-slate-500">Zatím nemáte žádnou historii.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Místo</th>
                      <th>Čas</th>
                      <th>Stav</th>
                    </tr>
                  </thead>
                  <tbody>
                    {past.slice(0, 60).map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap">{formatDateWithDay(r.date)}</td>
                        <td>č. {r.spot.code}</td>
                        <td className="whitespace-nowrap">
                          {describeRange(r.startMinute, r.endMinute, r.kind)}
                        </td>
                        <td>
                          {r.status === 'CANCELLED' ? (
                            <span className="badge bg-slate-100 text-slate-600">zrušeno</span>
                          ) : (
                            <span className="badge bg-emerald-100 text-emerald-700">proběhlo</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          {quotas.map((quota, index) => (
            <div key={quota.weekKey}>
              {index === 1 && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Příští týden
                </p>
              )}
              <QuotaCard quota={quota} compact={index > 0} />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
