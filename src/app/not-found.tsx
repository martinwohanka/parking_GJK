import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card card-pad max-w-md text-center">
        <p className="text-4xl font-bold text-brand-600">404</p>
        <h1 className="mt-2 text-lg font-semibold">Stránka nebyla nalezena</h1>
        <p className="mt-1 text-sm text-slate-500">
          Odkaz je nejspíš neplatný nebo parkovací místo už neexistuje.
        </p>
        <Link href="/" className="btn-primary mt-5">
          Zpět na parkoviště
        </Link>
      </div>
    </div>
  );
}
