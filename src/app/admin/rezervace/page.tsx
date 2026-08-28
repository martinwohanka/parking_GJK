import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import { formatMinute, isValidDateString, todayString } from '@/lib/time';
import { AppShell } from '@/components/AppShell';
import { AdminNav } from '@/components/AdminNav';
import { AdminReservations } from './AdminReservations';

export const dynamic = 'force-dynamic';

export default async function AdminReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ od?: string; do?: string; misto?: string; stav?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/prihlaseni');
  if (user.role !== 'ADMIN') redirect('/');

  const params = await searchParams;
  const today = todayString();
  const from = params.od && isValidDateString(params.od) ? params.od : today;
  const to = params.do && isValidDateString(params.do) ? params.do : undefined;
  const status = params.stav === 'CANCELLED' || params.stav === 'ALL' ? params.stav : 'ACTIVE';

  const settings = await getSettings();
  const [reservations, spots, users] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        date: { gte: from, ...(to ? { lte: to } : {}) },
        ...(status === 'ALL' ? {} : { status }),
        ...(params.misto ? { spot: { code: params.misto } } : {}),
      },
      include: { spot: true, user: { include: { plates: true } } },
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
      take: 300,
    }),
    prisma.parkingSpot.findMany({ orderBy: [{ section: 'asc' }, { position: 'asc' }] }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <AppShell
      user={user}
      title="Rezervace"
      subtitle="Vytváření, úprava a rušení rezervací kantorů"
    >
      <AdminNav />
      <AdminReservations
        reservations={reservations.map((r) => ({
          id: r.id,
          date: r.date,
          startMinute: r.startMinute,
          endMinute: r.endMinute,
          kind: r.kind,
          status: r.status,
          note: r.note,
          spotId: r.spotId,
          spotCode: r.spot.code,
          userName: r.user.name,
          userEmail: r.user.email,
          plates: r.user.plates.map((p) => p.display).join(', '),
        }))}
        spots={spots.map((s) => ({ id: s.id, code: s.code, isActive: s.isActive }))}
        users={users}
        filters={{ from, to: to ?? '', spot: params.misto ?? '', status }}
        defaultStart={formatMinute(settings.dayStartMinute)}
        defaultEnd={formatMinute(settings.dayEndMinute)}
      />
    </AppShell>
  );
}
