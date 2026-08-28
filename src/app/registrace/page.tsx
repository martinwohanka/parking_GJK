import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AuthCard } from '@/components/AuthCard';
import { RegisterForm } from './RegisterForm';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect('/');
  const domain = process.env.ALLOWED_EMAIL_DOMAIN ?? 'gjk.cz';

  return (
    <AuthCard
      title="Registrace kantora"
      subtitle={`Pouze pro školní e-maily @${domain}`}
      footer={
        <>
          Už máte účet?{' '}
          <Link href="/prihlaseni" className="font-medium text-brand-700 hover:underline">
            Přihlaste se
          </Link>
        </>
      }
    >
      <RegisterForm domain={domain} />
    </AuthCard>
  );
}
