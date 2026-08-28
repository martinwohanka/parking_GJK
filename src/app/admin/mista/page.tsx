import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { todayString } from '@/lib/time';
import { AppShell } from '@/components/AppShell';
import { AdminNav } from '@/components/AdminNav';
import { AdminSpots } from './AdminSpots';

export const dynamic = 'force-dynamic';

export default async function AdminSpotsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/prihlaseni');
  if (user.role !== 'ADMIN') redirect('/');

  const today = todayString();
  const spots = await prisma.parkingSpot.findMany({
    orderBy: [{ section: 'asc' }, { position: 'asc' }, { code: 'asc' }],
    include: {
      _count: {
        select: { reservations: { where: { status: 'ACTIVE', date: { gte: today } } } },
      },
    },
  });

  return (
    <AppShell
      user={user}
      title="Parkovací místa"
      subtitle="Mapa míst podle skutečného stavu parkoviště – označení, sekce a pořadí v plánku"
    >
      <AdminNav />
      <AdminSpots
        spots={spots.map((s) => ({
          id: s.id,
          code: s.code,
          label: s.label,
          note: s.note,
          section: s.section,
          position: s.position,
          isActive: s.isActive,
          upcoming: s._count.reservations,
        }))}
      />
    </AppShell>
  );
}
