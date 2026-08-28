import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { formatMinute } from '@/lib/time';
import { AppShell } from '@/components/AppShell';
import { AdminNav } from '@/components/AdminNav';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/prihlaseni');
  if (user.role !== 'ADMIN') redirect('/');

  const settings = await getSettings();

  return (
    <AppShell
      user={user}
      title="Nastavení"
      subtitle="Provozní doba, vstupní kritéria pro rezervace a pravidla trestných bodů"
    >
      <AdminNav />
      <SettingsForm
        settings={{
          dayStart: formatMinute(settings.dayStartMinute),
          dayEnd: formatMinute(settings.dayEndMinute),
          slotMinutes: settings.slotMinutes,
          openDays: settings.openDays.split(',').filter(Boolean),
          maxAdvanceDays: settings.maxAdvanceDays,
          weeklyTokens: settings.weeklyTokens,
          maxPerDay: settings.maxPerDay,
          minDurationMinutes: settings.minDurationMinutes,
          allowOvernight: settings.allowOvernight,
          allowAllDay: settings.allowAllDay,
          pointsPerTokenLoss: settings.pointsPerTokenLoss,
          blockAtPoints: settings.blockAtPoints,
          penaltyDecayDays: settings.penaltyDecayDays,
          noticeText: settings.noticeText ?? '',
        }}
      />
    </AppShell>
  );
}
