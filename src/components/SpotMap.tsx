import Link from 'next/link';
import { compareSpotCodes, type SpotOverview } from '@/lib/reservations';

function tone(spot: SpotOverview) {
  if (!spot.spot.isActive) return 'border-slate-300 bg-slate-100 text-slate-400';
  if (spot.totalSlotsTotal === 0) return 'border-slate-200 bg-slate-50 text-slate-400';
  const ratio = spot.freeSlotsTotal / spot.totalSlotsTotal;
  if (ratio === 0) return 'border-red-300 bg-red-100 text-red-800 hover:bg-red-200';
  if (ratio < 0.34) return 'border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200';
  return 'border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-200';
}

function statusLabel(spot: SpotOverview): string {
  if (!spot.spot.isActive) return 'mimo provoz';
  if (spot.totalSlotsTotal === 0) return 'týden proběhl';
  return `${spot.freeSlotsTotal} volných h`;
}

/**
 * Dlaždice jednoho místa.
 *
 * `orientation` odpovídá skutečnému stání vozu na parkovišti:
 *  - 'portrait'  = vůz stojí podélně u zdi (místa u budovy),
 *  - 'landscape' = vůz zaparkuje kolmo (řada míst naproti).
 */
function SpotTile({
  spot,
  weekStart,
  orientation,
}: {
  spot: SpotOverview;
  weekStart: string;
  orientation: 'portrait' | 'landscape';
}) {
  return (
    <Link
      href={`/misto/${encodeURIComponent(spot.spot.code)}?tyden=${weekStart}`}
      className={`flex flex-col items-center justify-center rounded-lg border-2 px-2 text-center transition ${
        orientation === 'portrait' ? 'min-h-[9.5rem] py-4' : 'min-h-[3.5rem] flex-1 py-2'
      } ${tone(spot)}`}
      title={spot.spot.label ?? `Místo ${spot.spot.code}`}
    >
      <span className="text-lg font-bold leading-none">{spot.spot.code}</span>
      <span className="mt-1 text-[11px] leading-tight">{statusLabel(spot)}</span>
      {spot.days.some((d) => d.hasMine) && (
        <span className="mt-1 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          moje
        </span>
      )}
    </Link>
  );
}

/**
 * Plánek parkoviště podle skutečného rozmístění: vlevo podélná stání u budovy
 * (místa 8–10), vpravo kolmá stání (místa 1–7), výjezd dole přes celou šířku.
 */
export function SpotMap({
  spots,
  weekStart,
}: {
  spots: SpotOverview[];
  weekStart: string;
}) {
  const byPosition = (a: SpotOverview, b: SpotOverview) =>
    a.spot.position - b.spot.position || compareSpotCodes(a.spot.code, b.spot.code);
  const left = spots.filter((s) => s.spot.section === 'LEFT').sort(byPosition);
  const right = spots.filter((s) => s.spot.section !== 'LEFT').sort(byPosition);

  return (
    <div className="card card-pad">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">Plánek parkoviště</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-emerald-300 bg-emerald-100" /> volno
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-amber-300 bg-amber-100" /> částečně
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-red-300 bg-red-100" /> obsazeno
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-xl rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3">
        {/* Užší levý sloupec = podélná stání u zdi, širší pravý = kolmá stání. */}
        <div className="grid grid-cols-[6rem_1fr] gap-3 sm:grid-cols-[8rem_1fr] sm:gap-5">
          <div>
            <p className="mb-2 rounded-md bg-slate-200 px-1 py-1 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-600 sm:text-[11px]">
              Vstup do budovy
            </p>
            <div className="space-y-2">
              {left.map((spot) => (
                <SpotTile
                  key={spot.spot.id}
                  spot={spot}
                  weekStart={weekStart}
                  orientation="portrait"
                />
              ))}
            </div>
          </div>

          {/* Kolmá stání vyplní stejnou výšku jako podélná – plánek pak drží tvar plochy. */}
          <div className="flex h-full flex-col gap-2">
            {right.map((spot) => (
              <SpotTile
                key={spot.spot.id}
                spot={spot}
                weekStart={weekStart}
                orientation="landscape"
              />
            ))}
          </div>
        </div>

        <p className="mt-3 rounded-md bg-slate-300 px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-700">
          ↓ Výjezd z parkoviště ↓
        </p>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Počet volných hodin je uveden za zbývající část zobrazeného týdne. Kliknutím na místo se
        otevře detailní kalendář, kde lze rezervovat konkrétní časové sloty.
      </p>
    </div>
  );
}
