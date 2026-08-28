import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import { AppShell } from '@/components/AppShell';
import { AdminNav } from '@/components/AdminNav';
import { AdminPenalties } from './AdminPenalties';

export const dynamic = 'force-dynamic';

export default async function AdminPenaltiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/prihlaseni');
  if (user.role !== 'ADMIN') redirect('/');

  const settings = await getSettings();
  const reports = await prisma.penaltyReport.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      targetUser: { select: { name: true, email: true } },
      reportedBy: { select: { name: true } },
      resolvedBy: { select: { name: true } },
    },
  });

  return (
    <AppShell
      user={user}
      title="Trestné body"
      subtitle={`Schvalování nahlášeného špatného parkování • ${settings.pointsPerTokenLoss} b. = −1 token, blokace od ${settings.blockAtPoints} b.`}
    >
      <AdminNav />
      <AdminPenalties
        reports={reports.map((r) => ({
          id: r.id,
          plate: r.plateInput,
          reason: r.reason,
          points: r.points,
          status: r.status,
          occurredAt: r.occurredAt.toLocaleString('cs-CZ', {
            day: 'numeric',
            month: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
          targetName: r.targetUser?.name ?? null,
          targetEmail: r.targetUser?.email ?? null,
          reporterName: r.reportedBy?.name ?? 'neznámý',
          resolvedByName: r.resolvedBy?.name ?? null,
          resolutionNote: r.resolutionNote,
        }))}
      />
    </AppShell>
  );
}
