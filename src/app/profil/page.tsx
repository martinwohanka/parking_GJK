import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getQuota } from '@/lib/tokens';
import { AppShell } from '@/components/AppShell';
import { QuotaCard } from '@/components/QuotaCard';
import { PlateManager, PasswordForm, ProfileForm } from './forms';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/prihlaseni');

  const [record, plates, quota] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true, phone: true, role: true, createdAt: true },
    }),
    prisma.plate.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
    getQuota(user.id),
  ]);
  if (!record) redirect('/prihlaseni');

  return (
    <AppShell user={user} title="Můj profil" subtitle={record.email}>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <div className="card card-pad">
            <h2 className="section-title mb-3">Osobní údaje</h2>
            <ProfileForm name={record.name} phone={record.phone ?? ''} email={record.email} />
          </div>

          <div className="card card-pad">
            <h2 className="section-title mb-1">Moje vozidla (SPZ)</h2>
            <p className="mb-3 text-sm text-slate-500">
              SPZ slouží ke kontrole parkování. Bez alespoň jedné evidované SPZ nelze rezervovat.
            </p>
            <PlateManager plates={plates} />
          </div>

          <div className="card card-pad">
            <h2 className="section-title mb-3">Změna hesla</h2>
            <PasswordForm />
          </div>
        </div>

        <div className="space-y-5">
          <QuotaCard quota={quota} />
          <div className="card card-pad text-sm">
            <h2 className="section-title mb-3">Účet</h2>
            <dl className="space-y-1.5">
              <div className="flex justify-between">
                <dt className="text-slate-500">Role</dt>
                <dd className="font-medium">
                  {record.role === 'ADMIN' ? 'Správce' : 'Kantor'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Registrace</dt>
                <dd className="font-medium">
                  {record.createdAt.toLocaleDateString('cs-CZ')}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
