import type { QuotaInfo } from '@/lib/tokens';

export function QuotaCard({ quota, compact = false }: { quota: QuotaInfo; compact?: boolean }) {
  const pct =
    quota.totalTokens > 0
      ? Math.min(100, Math.round((quota.usedTokens / quota.totalTokens) * 100))
      : 100;

  return (
    <div className="card card-pad">
      <h2 className="section-title mb-1">Týdenní příděl rezervací</h2>
      <p className="text-xs text-slate-500">Kalendářní týden {quota.weekKey}</p>

      <div className="mt-4 flex items-end gap-2">
        <span className="text-3xl font-bold text-slate-900">{quota.remainingTokens}</span>
        <span className="pb-1 text-sm text-slate-500">z {quota.totalTokens} volných</span>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${
            quota.remainingTokens === 0 ? 'bg-red-500' : 'bg-brand-600'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {!compact && (
        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Základní příděl</dt>
            <dd className="font-medium">{quota.baseTokens}</dd>
          </div>
          {quota.adjustment !== 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-500">Úprava správcem</dt>
              <dd className="font-medium">
                {quota.adjustment > 0 ? `+${quota.adjustment}` : quota.adjustment}
              </dd>
            </div>
          )}
          {quota.penaltyLoss > 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-500">Odečteno za trestné body</dt>
              <dd className="font-medium text-red-600">−{quota.penaltyLoss}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-slate-500">Využito tento týden</dt>
            <dd className="font-medium">{quota.usedTokens}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-100 pt-1.5">
            <dt className="text-slate-500">Trestné body</dt>
            <dd
              className={`font-medium ${
                quota.penaltyPoints > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {quota.penaltyPoints}
            </dd>
          </div>
        </dl>
      )}

      {quota.isBlocked && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          Rezervace jsou zablokovány kvůli počtu trestných bodů.
        </p>
      )}
    </div>
  );
}
