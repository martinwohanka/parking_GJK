'use client';

import { useActionState, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createReservationsAction,
  type ReservationFormState,
} from '@/app/actions/reservations';
import { Alert } from '@/components/Alert';
import { SubmitButton } from '@/components/SubmitButton';
import type { DayRow, SlotCell } from '@/lib/reservations';

type Selection = { date: string; startMinute: number; endMinute: number; kind: string };

const initial: ReservationFormState = {};

function keyOf(date: string, startMinute: number): string {
  return `${date}@${startMinute}`;
}

function pad(minute: number): string {
  const h = Math.floor((minute % 1440) / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function cellClasses(state: SlotCell['state'], selected: boolean): string {
  if (selected) return 'slot-cell border-red-500 bg-red-500 text-white shadow-sm';
  switch (state) {
    case 'FREE':
      return 'slot-cell border-emerald-300 bg-emerald-100 text-emerald-800 hover:border-emerald-500 hover:bg-emerald-200 cursor-pointer';
    case 'TAKEN':
      return 'slot-cell border-red-200 bg-red-100 text-red-800 cursor-not-allowed';
    case 'MINE':
      return 'slot-cell border-brand-400 bg-brand-100 text-brand-800 cursor-not-allowed';
    case 'PAST':
      return 'slot-cell border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed';
    default:
      return 'slot-cell border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed';
  }
}

/** Zkratka jména držitele rezervace pro zobrazení v malé buňce. */
function shortName(name?: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 8);
  return `${parts[0][0]}. ${parts[parts.length - 1]}`.slice(0, 12);
}

export function ReservationGrid({
  spotId,
  spotCode,
  days,
  slotStarts,
  canReserve,
  blockedReason,
  remainingTokens,
  allowAllDay,
  allowOvernight,
}: {
  spotId: string;
  spotCode: string;
  days: DayRow[];
  slotStarts: number[];
  canReserve: boolean;
  blockedReason?: string;
  remainingTokens: number;
  allowAllDay: boolean;
  allowOvernight: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Map<string, Selection>>(new Map());
  const [state, action] = useActionState(
    async (prev: ReservationFormState, formData: FormData) => {
      const result = await createReservationsAction(prev, formData);
      if (result.success) {
        setSelected(new Map());
        router.refresh();
      } else if (result.error && result.error.startsWith('Vytvořeno')) {
        setSelected(new Map());
        router.refresh();
      }
      return result;
    },
    initial,
  );

  const openDays = days.filter((d) => d.isOpen);

  const toggle = (day: DayRow, slot: SlotCell, kind: string) => {
    if (!canReserve || slot.state !== 'FREE') return;
    const key = keyOf(day.date, slot.startMinute);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else
        next.set(key, {
          date: day.date,
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
          kind,
        });
      return next;
    });
  };

  const toggleWholeDay = (day: DayRow) => {
    if (!canReserve) return;
    const free = day.slots.filter((s) => s.state === 'FREE');
    if (free.length === 0) return;
    const allSelected = free.every((s) => selected.has(keyOf(day.date, s.startMinute)));
    setSelected((prev) => {
      const next = new Map(prev);
      for (const slot of free) {
        const key = keyOf(day.date, slot.startMinute);
        if (allSelected) next.delete(key);
        else
          next.set(key, {
            date: day.date,
            startMinute: slot.startMinute,
            endMinute: slot.endMinute,
            kind: 'ALL_DAY',
          });
      }
      return next;
    });
  };

  /** Počet rezervací = počet souvislých bloků; každý stojí jeden token. */
  const summary = useMemo(() => {
    const byDay = new Map<string, Selection[]>();
    for (const sel of selected.values()) {
      const list = byDay.get(`${sel.date}|${sel.kind === 'OVERNIGHT' ? 'N' : 'D'}`) ?? [];
      list.push(sel);
      byDay.set(`${sel.date}|${sel.kind === 'OVERNIGHT' ? 'N' : 'D'}`, list);
    }
    const blocks: { date: string; startMinute: number; endMinute: number; overnight: boolean }[] = [];
    for (const [key, list] of byDay) {
      const [date, type] = key.split('|');
      const sorted = [...list].sort((a, b) => a.startMinute - b.startMinute);
      for (const item of sorted) {
        const last = blocks[blocks.length - 1];
        if (
          last &&
          last.date === date &&
          last.overnight === (type === 'N') &&
          item.startMinute <= last.endMinute
        ) {
          last.endMinute = Math.max(last.endMinute, item.endMinute);
        } else {
          blocks.push({
            date,
            startMinute: item.startMinute,
            endMinute: item.endMinute,
            overnight: type === 'N',
          });
        }
      }
    }
    blocks.sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute);
    return blocks;
  }, [selected]);

  const payload = useMemo(
    () => JSON.stringify([...selected.values()]),
    [selected],
  );

  const overBudget = summary.length > remainingTokens;

  return (
    <div className="space-y-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}
      {blockedReason && <Alert kind="warning">{blockedReason}</Alert>}

      <div className="card card-pad">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Kalendář místa č. {spotCode}</h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-emerald-300 bg-emerald-100" /> volno
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-red-200 bg-red-100" /> obsazeno
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-brand-400 bg-brand-100" /> moje
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-red-500 bg-red-500" /> vybráno
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="mb-1 flex items-stretch gap-1">
              <div className="w-24 shrink-0" />
              {slotStarts.map((start) => (
                <div
                  key={start}
                  className="flex-1 text-center text-[11px] font-semibold text-slate-500"
                >
                  {pad(start)}
                </div>
              ))}
              {allowOvernight && (
                <div className="w-20 shrink-0 text-center text-[11px] font-semibold text-slate-500">
                  přes noc
                </div>
              )}
              {allowAllDay && <div className="w-24 shrink-0" />}
            </div>

            {openDays.map((day) => {
              const freeInDay = day.slots.filter((s) => s.state === 'FREE');
              const dayAllSelected =
                freeInDay.length > 0 &&
                freeInDay.every((s) => selected.has(keyOf(day.date, s.startMinute)));
              return (
                <div key={day.date} className="mb-1 flex items-stretch gap-1">
                  <div
                    className={`flex w-24 shrink-0 flex-col justify-center rounded-md px-2 py-1 text-xs ${
                      day.isToday ? 'bg-brand-50 font-semibold text-brand-800' : 'text-slate-600'
                    }`}
                  >
                    <span className="font-semibold">{dayLabel(day.date)}</span>
                    <span className="text-[10px] text-slate-400">{shortDate(day.date)}</span>
                  </div>

                  {day.slots.map((slot) => {
                    const key = keyOf(day.date, slot.startMinute);
                    const isSelected = selected.has(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggle(day, slot, 'RANGE')}
                        disabled={!canReserve || slot.state !== 'FREE'}
                        aria-pressed={isSelected}
                        title={
                          slot.state === 'TAKEN' || slot.state === 'MINE'
                            ? `${pad(slot.startMinute)}–${pad(slot.endMinute)} • ${slot.holderName}`
                            : `${pad(slot.startMinute)}–${pad(slot.endMinute)}`
                        }
                        className={cellClasses(slot.state, isSelected)}
                      >
                        {slot.state === 'TAKEN' || slot.state === 'MINE' ? (
                          <span className="truncate px-1 text-[10px] leading-tight">
                            {shortName(slot.holderName)}
                          </span>
                        ) : isSelected ? (
                          '✓'
                        ) : (
                          ''
                        )}
                      </button>
                    );
                  })}

                  {allowOvernight && (
                    <button
                      type="button"
                      onClick={() =>
                        day.overnight && toggle(day, day.overnight, 'OVERNIGHT')
                      }
                      disabled={!canReserve || day.overnight?.state !== 'FREE'}
                      title={
                        day.overnight
                          ? `${pad(day.overnight.startMinute)}–${pad(day.overnight.endMinute)} (přes noc)${
                              day.overnight.holderName ? ` • ${day.overnight.holderName}` : ''
                            }`
                          : ''
                      }
                      className={`${cellClasses(
                        day.overnight?.state ?? 'CLOSED',
                        day.overnight
                          ? selected.has(keyOf(day.date, day.overnight.startMinute))
                          : false,
                      )} w-20 shrink-0 grow-0`}
                    >
                      <span className="text-[10px]">
                        {day.overnight?.state === 'TAKEN' || day.overnight?.state === 'MINE'
                          ? shortName(day.overnight.holderName)
                          : '🌙'}
                      </span>
                    </button>
                  )}

                  {allowAllDay && (
                    <button
                      type="button"
                      onClick={() => toggleWholeDay(day)}
                      disabled={!canReserve || freeInDay.length === 0}
                      className={`w-24 shrink-0 rounded-md border px-2 text-[11px] font-medium transition ${
                        dayAllSelected
                          ? 'border-red-500 bg-red-50 text-red-700'
                          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40'
                      }`}
                    >
                      {dayAllSelected ? 'zrušit výběr' : 'celý den'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Klikáním označte volné (zelené) sloty – zčervenají. Navazující sloty v jednom dni se
          sloučí do jedné rezervace a stojí jeden token z týdenního přídělu.
        </p>
      </div>

      <form action={action} className="card card-pad">
        <input type="hidden" name="spotId" value={spotId} />
        <input type="hidden" name="selections" value={payload} />

        <h2 className="section-title mb-3">Souhrn rezervace</h2>

        {summary.length === 0 ? (
          <p className="text-sm text-slate-500">Zatím nemáte vybraný žádný časový slot.</p>
        ) : (
          <ul className="mb-4 space-y-1.5 text-sm">
            {summary.map((block) => (
              <li
                key={`${block.date}-${block.startMinute}`}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
              >
                <span>
                  <strong>{dayLabel(block.date)}</strong> {shortDate(block.date)} •{' '}
                  {pad(block.startMinute)}–{pad(block.endMinute)}
                  {block.overnight && ' (přes noc)'}
                </span>
                <span className="badge bg-white text-slate-500 ring-1 ring-slate-200">1 token</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mb-4">
          <label className="label" htmlFor="note">
            Poznámka <span className="font-normal text-slate-400">(nepovinné)</span>
          </label>
          <input
            id="note"
            name="note"
            maxLength={200}
            placeholder="např. návštěva rodičů, služební cesta"
            className="field"
          />
        </div>

        {overBudget && (
          <Alert kind="error">
            Vybrali jste {summary.length} rezervací, ale v tomto týdnu vám zbývá jen{' '}
            {remainingTokens}.
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton
            className="btn-primary"
            pendingLabel="Rezervuji…"
            disabled={summary.length === 0 || !canReserve || overBudget}
          >
            Potvrdit rezervaci
            {summary.length > 0 ? ` (${summary.length})` : ''}
          </SubmitButton>
          {summary.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Map())}
              className="btn-secondary"
            >
              Zrušit výběr
            </button>
          )}
          <span className="text-xs text-slate-500">
            Zbývá {remainingTokens} rezervací v tomto týdnu
          </span>
        </div>
      </form>
    </div>
  );
}

const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return DAYS[(wd + 6) % 7];
}

function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d}. ${m}.`;
}
