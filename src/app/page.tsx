import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getWeekOverview } from '@/lib/reservations';
import { getSettings } from '@/lib/settings';
import { getQuota } from '@/lib/tokens';
import {
  DAY_NAMES_SHORT,
  formatDateHuman,
  formatMinute,
  isValidDateString,
  isoWeekday,
  startOfWeek,
  todayString,
} from '@/lib/time';
import { AppShell } from '@/components/AppShell';
import { Alert } from '@/components/Alert';
import { SpotMap } from '@/components/SpotMap';
import { WeekSwitcher } from '@/components/WeekSwitcher';
import { QuotaCard } from '@/components/QuotaCard';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tyden?: string; vitejte?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/prihlaseni');

  const params = await searchParams;
  const weekStart = startOfWeek(
    params.tyden && isValidDateString(params.tyden) ? params.tyden : todayString(),
  );

  const settings = await getSettings();
  const [{ spots, dates }, quota, plateCount] = await Promise.all([
    getWeekOverview(weekStart, user.id, settings),
    getQuota(user.id, weekStart, settings),
    prisma.plate.count({ where: { userId: user.id } }),
  ]);

  return (
    <AppShell
      user={user}
      title="Parkoviště GJK"
      subtitle={`Provozní doba ${formatMinute(settings.dayStartMinute)}–${formatMinute(
        settings.dayEndMinute,
      )} • rezervace až ${settings.maxAdvanceDays} dní dopředu`}
      actions={<WeekSwitcher weekStart={weekStart} basePath="/" />}
    >
      {params.vitejte && (
        <Alert kind="success">
          Registrace proběhla úspěšně. Vyberte si volné místo a rezervujte si čas.
        </Alert>
      )}

      {plateCount === 0 && (
        <Alert kind="warning">
          Nemáte uloženou žádnou SPZ. Bez ní nelze rezervovat –{' '}
          <Link href="/profil" className="font-medium underline">
            doplňte ji v profilu
          </Link>
          .
        </Alert>
      )}

      {quota.isBlocked && (
        <Alert kind="error">
          Rezervace jsou dočasně zablokovány kvůli {quota.penaltyPoints} trestným bodům za
          nesprávné parkování. Obraťte se prosím na správce parkoviště.
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <SpotMap spots={spots} weekStart={weekStart} />

          <div className="card card-pad">
            <h2 className="section-title mb-3">Volné hodiny v týdnu</h2>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white">Místo</th>
                    {dates.map((date) => (
                      <th key={date} className="text-center">
                        {DAY_NAMES_SHORT[isoWeekday(date) - 1]}
                        <span className="block text-[10px] font-normal normal-case text-slate-400">
                          {formatDateHuman(date).replace(/ \d{4}$/, '')}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {spots.map((spot) => (
                    <tr key={spot.spot.id} className="hover:bg-slate-50">
                      <td className="sticky left-0 bg-white font-medium">
                        <Link
                          href={`/misto/${encodeURIComponent(spot.spot.code)}?tyden=${weekStart}`}
                          className="text-brand-700 hover:underline"
                        >
                          č. {spot.spot.code}
                        </Link>
                        {!spot.spot.isActive && (
                          <span className="ml-2 badge bg-slate-100 text-slate-500">mimo provoz</span>
                        )}
                      </td>
                      {spot.days.map((day) => (
                        <td key={day.date} className="text-center">
                          <span
                            className={`badge ${
                              !spot.spot.isActive || day.isPast
                                ? 'bg-slate-100 text-slate-400'
                                : day.freeSlots === 0
                                  ? 'bg-red-100 text-red-700'
                                  : day.freeSlots === day.totalSlots
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {!spot.spot.isActive || day.isPast
                              ? '—'
                              : `${day.freeSlots}/${day.totalSlots}`}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <QuotaCard quota={quota} />

          {settings.noticeText && (
            <div className="card card-pad">
              <h2 className="section-title mb-2">Pravidla parkoviště</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {settings.noticeText}
              </p>
            </div>
          )}

          <div className="card card-pad">
            <h2 className="section-title mb-2">Rychlé odkazy</h2>
            <div className="space-y-2">
              <Link href="/rezervace" className="btn-secondary w-full">
                Moje rezervace
              </Link>
              <Link href="/prestupky" className="btn-secondary w-full">
                Nahlásit špatné parkování
              </Link>
              <Link href="/profil" className="btn-secondary w-full">
                Moje SPZ a profil
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
