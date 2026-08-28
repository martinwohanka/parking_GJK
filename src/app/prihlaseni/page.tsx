import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AuthCard } from '@/components/AuthCard';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/');

  return (
    <AuthCard
      title="Přihlášení"
      subtitle="Rezervace parkoviště Gymnázia Jana Keplera"
      footer={
        <>
          Nemáte účet?{' '}
          <Link href="/registrace" className="font-medium text-brand-700 hover:underline">
            Zaregistrujte se
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
