import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import { getQuota } from '@/lib/tokens';
import { todayString } from '@/lib/time';
import { AppShell } from '@/components/AppShell';
import { AdminNav } from '@/components/AdminNav';
import { AdminUsers } from './AdminUsers';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/prihlaseni');
  if (user.role !== 'ADMIN') redirect('/');

  const settings = await getSettings();
  const today = todayString();
  const users = await prisma.user.findMany({
    include: {
      plates: true,
      _count: { select: { reservations: true } },
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });

  const rows = await Promise.all(
    users.map(async (u) => {
      const quota = await getQuota(u.id, today, settings);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt.toLocaleDateString('cs-CZ'),
        reservationCount: u._count.reservations,
        plates: u.plates.map((p) => ({ id: p.id, display: p.display })),
        penaltyPoints: quota.penaltyPoints,
        totalTokens: quota.totalTokens,
        usedTokens: quota.usedTokens,
        adjustment: quota.adjustment,
        isBlocked: quota.isBlocked,
      };
    }),
  );

  return (
    <AppShell
      user={user}
      title="Uživatelé"
      subtitle="Kantoři, jejich SPZ, týdenní příděl a trestné body"
    >
      <AdminNav />
      <AdminUsers users={rows} currentUserId={user.id} />
    </AppShell>
  );
}
