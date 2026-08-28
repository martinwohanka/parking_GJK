import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import { getQuota } from '@/lib/tokens';
import { AppShell } from '@/components/AppShell';
import { ReportForm } from './ReportForm';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  PENDING: { text: 'ke schválení', className: 'bg-amber-100 text-amber-800' },
  CONFIRMED: { text: 'potvrzeno', className: 'bg-red-100 text-red-700' },
  REJECTED: { text: 'zamítnuto', className: 'bg-slate-100 text-slate-600' },
};

export default async function PenaltiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/prihlaseni');

  const settings = await getSettings();
  const [myReports, againstMe, quota] = await Promise.all([
    prisma.penaltyReport.findMany({
      where: { reportedById: user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.penaltyReport.findMany({
      where: { targetUserId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    getQuota(user.id),
  ]);

  return (
    <AppShell
      user={user}
      title="Špatné parkování"
      subtitle="Nahlaste vozidlo, které blokuje jiné místo nebo nestojí ve vyznačeném prostoru"
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <div className="card card-pad">
            <h2 className="section-title mb-1">Nahlásit vozidlo</h2>
            <p className="mb-4 text-sm text-slate-500">
              Nahlášení posoudí správce parkoviště. Po potvrzení se majiteli SPZ připíše{' '}
              1 trestný bod. Za každých {settings.pointsPerTokenLoss} bodů se snižuje týdenní
              příděl rezervací o jednu; při {settings.blockAtPoints} bodech se rezervace blokují.
            </p>
            <ReportForm />
          </div>

          <div className="card card-pad">
            <h2 className="section-title mb-3">Moje nahlášení ({myReports.length})</h2>
            {myReports.length === 0 ? (
              <p className="text-sm text-slate-500">Zatím jste nic nenahlásili.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>SPZ</th>
                      <th>Kdy</th>
                      <th>Důvod</th>
                      <th>Stav</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myReports.map((report) => (
                      <tr key={report.id}>
                        <td className="whitespace-nowrap font-mono font-semibold">
                          {report.plateInput}
                        </td>
                        <td className="whitespace-nowrap text-slate-500">
                          {report.occurredAt.toLocaleDateString('cs-CZ')}
                        </td>
                        <td className="max-w-[16rem] truncate">{report.reason}</td>
                        <td>
                          <span className={`badge ${STATUS_LABEL[report.status].className}`}>
                            {STATUS_LABEL[report.status].text}
                          </span>
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
          <div className="card card-pad">
            <h2 className="section-title mb-1">Moje trestné body</h2>
            <p className="mt-2 text-3xl font-bold text-slate-900">{quota.penaltyPoints}</p>
            <p className="text-xs text-slate-500">
              Body se přestávají počítat po {settings.penaltyDecayDays} dnech.
            </p>
            {quota.penaltyLoss > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Týdenní příděl je kvůli bodům snížen o {quota.penaltyLoss}.
              </p>
            )}
            {quota.isBlocked && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                Rezervace jsou zablokovány. Kontaktujte správce parkoviště.
              </p>
            )}
          </div>

          <div className="card card-pad">
            <h2 className="section-title mb-3">Nahlášení mých vozidel</h2>
            {againstMe.length === 0 ? (
              <p className="text-sm text-slate-500">Vaše vozidla nikdo nenahlásil. 👍</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {againstMe.map((report) => (
                  <li key={report.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold">{report.plateInput}</span>
                      <span className={`badge ${STATUS_LABEL[report.status].className}`}>
                        {STATUS_LABEL[report.status].text}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {report.occurredAt.toLocaleDateString('cs-CZ')} • {report.reason}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
