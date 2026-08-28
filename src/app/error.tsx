'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card card-pad max-w-md text-center">
        <h1 className="text-lg font-semibold">Něco se pokazilo</h1>
        <p className="mt-1 text-sm text-slate-500">
          Akci se nepodařilo dokončit. Zkuste to prosím znovu, případně kontaktujte správce.
        </p>
        <button type="button" onClick={reset} className="btn-primary mt-5">
          Zkusit znovu
        </button>
      </div>
    </div>
  );
}
