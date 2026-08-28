const STYLES: Record<string, string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-brand-200 bg-brand-50 text-brand-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
};

export function Alert({
  kind = 'info',
  children,
}: {
  kind?: keyof typeof STYLES | string;
  children: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`mb-4 rounded-lg border px-4 py-3 text-sm ${STYLES[kind] ?? STYLES.info}`}
    >
      {children}
    </div>
  );
}
