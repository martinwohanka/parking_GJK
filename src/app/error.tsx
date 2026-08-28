'use client';

/**
 * Záchytná obrazovka pro chyby na serveru.
 *
 * Nejčastější chyba při prvním spuštění je nepřipravená databáze – místo
 * obecného „něco se pokazilo“ ji poznáme a rovnou poradíme, co spustit.
 * Ve vývojovém režimu navíc ukážeme původní hlášku, aby šlo problém nahlásit.
 */
const DB_HINTS = [
  'does not exist in the current database',
  'Unable to open the database file',
  'no such table',
  'Environment variable not found: DATABASE_URL',
  'P2021',
  'P1003',
  'P1012',
];

function looksLikeMissingDatabase(message: string): boolean {
  return DB_HINTS.some((hint) => message.includes(hint));
}

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const message = error?.message ?? '';
  const missingDatabase = looksLikeMissingDatabase(message);
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card card-pad w-full max-w-xl">
        {missingDatabase ? (
          <>
            <h1 className="text-lg font-semibold">Databáze není připravená</h1>
            <p className="mt-2 text-sm text-slate-600">
              Databáze zatím není založená (nebo chybí soubor <code>.env</code> s jejím
              nastavením). Zastavte aplikaci v terminálu klávesami{' '}
              <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs">
                Ctrl+C
              </kbd>{' '}
              a ve složce projektu spusťte:
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 px-4 py-3 text-sm text-slate-100">
              npm run setup
            </pre>
            <p className="mt-3 text-sm text-slate-600">
              Potom aplikaci spusťte znovu příkazem{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">npm run dev</code>.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Něco se pokazilo</h1>
            <p className="mt-2 text-sm text-slate-600">
              Akci se nepodařilo dokončit. Zkuste to prosím znovu, případně kontaktujte
              správce parkoviště.
            </p>
          </>
        )}

        {isDev && message && (
          <details className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">
              Podrobnosti pro vývojáře
            </summary>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap">{message}</pre>
          </details>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="btn-primary">
            Zkusit znovu
          </button>
          <a href="/" className="btn-secondary">
            Na úvodní stránku
          </a>
        </div>
      </div>
    </div>
  );
}
