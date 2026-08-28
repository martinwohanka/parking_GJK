'use client';

import { Fragment, useActionState, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  adminCancelReservationAction,
  adminCreateReservationAction,
  adminUpdateReservationAction,
  type AdminFormState,
} from '@/app/actions/admin';
import { Alert } from '@/components/Alert';
import { SubmitButton } from '@/components/SubmitButton';

const initial: AdminFormState = {};

type Row = {
  id: string;
  date: string;
  startMinute: number;
  endMinute: number;
  kind: string;
  status: string;
  note: string | null;
  spotId: string;
  spotCode: string;
  userName: string;
  userEmail: string;
  plates: string;
};

function hm(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[(wd + 6) % 7]} ${d}. ${m}.`;
}

export function AdminReservations({
  reservations,
  spots,
  users,
  filters,
  defaultStart,
  defaultEnd,
}: {
  reservations: Row[];
  spots: { id: string; code: string; isActive: boolean }[];
  users: { id: string; name: string; email: string }[];
  filters: { from: string; to: string; spot: string; status: string };
  defaultStart: string;
  defaultEnd: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const wrap =
    (fn: (prev: AdminFormState, formData: FormData) => Promise<AdminFormState>) =>
    async (prev: AdminFormState, formData: FormData) => {
      const result = await fn(prev, formData);
      if (result.success) {
        setEditing(null);
        setShowCreate(false);
        router.refresh();
      }
      return result;
    };

  const [createState, createAction] = useActionState(
    wrap(adminCreateReservationAction),
    initial,
  );
  const [editState, editAction] = useActionState(wrap(adminUpdateReservationAction), initial);
  const [cancelState, cancelAction] = useActionState(
    wrap(adminCancelReservationAction),
    initial,
  );

  const applyFilters = (formData: FormData) => {
    const query = new URLSearchParams(searchParams.toString());
    for (const [key, value] of [
      ['od', formData.get('od')],
      ['do', formData.get('do')],
      ['misto', formData.get('misto')],
      ['stav', formData.get('stav')],
    ] as const) {
      const v = String(value ?? '');
      if (v) query.set(key, v);
      else query.delete(key);
    }
    router.push(`/admin/rezervace?${query.toString()}`);
  };

  return (
    <div className="space-y-5">
      {createState.error && <Alert kind="error">{createState.error}</Alert>}
      {createState.success && <Alert kind="success">{createState.success}</Alert>}
      {editState.error && <Alert kind="error">{editState.error}</Alert>}
      {editState.success && <Alert kind="success">{editState.success}</Alert>}
      {cancelState.error && <Alert kind="error">{cancelState.error}</Alert>}
      {cancelState.success && <Alert kind="success">{cancelState.success}</Alert>}

      <div className="card card-pad">
        <form action={applyFilters} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="od">
              Od
            </label>
            <input id="od" name="od" type="date" defaultValue={filters.from} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="do">
              Do
            </label>
            <input id="do" name="do" type="date" defaultValue={filters.to} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="misto">
              Místo
            </label>
            <select id="misto" name="misto" defaultValue={filters.spot} className="field">
              <option value="">všechna</option>
              {spots.map((s) => (
                <option key={s.id} value={s.code}>
                  č. {s.code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="stav">
              Stav
            </label>
            <select id="stav" name="stav" defaultValue={filters.status} className="field">
              <option value="ACTIVE">aktivní</option>
              <option value="CANCELLED">zrušené</option>
              <option value="ALL">všechny</option>
            </select>
          </div>
          <button type="submit" className="btn-secondary">
            Filtrovat
          </button>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="btn-primary ml-auto"
          >
            {showCreate ? 'Zavřít formulář' : '+ Nová rezervace'}
          </button>
        </form>
      </div>

      {showCreate && (
        <div className="card card-pad">
          <h2 className="section-title mb-3">Nová rezervace jménem kantora</h2>
          <p className="mb-4 text-sm text-slate-500">
            Rezervace založená správcem nečerpá týdenní tokeny kantora.
          </p>
          <form action={createAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="label" htmlFor="userId">
                Kantor
              </label>
              <select id="userId" name="userId" required className="field">
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="c-spotId">
                Místo
              </label>
              <select id="c-spotId" name="spotId" required className="field">
                {spots.map((s) => (
                  <option key={s.id} value={s.id}>
                    č. {s.code}
                    {s.isActive ? '' : ' (mimo provoz)'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="c-date">
                Datum
              </label>
              <input id="c-date" name="date" type="date" required className="field" />
            </div>
            <div>
              <label className="label" htmlFor="c-start">
                Od
              </label>
              <input
                id="c-start"
                name="start"
                type="time"
                defaultValue={defaultStart}
                required
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="c-end">
                Do
              </label>
              <input
                id="c-end"
                name="end"
                type="time"
                defaultValue={defaultEnd}
                required
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="c-note">
                Poznámka
              </label>
              <input id="c-note" name="note" className="field" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>Vytvořit rezervaci</SubmitButton>
            </div>
          </form>
        </div>
      )}

      <div className="card card-pad">
        <h2 className="section-title mb-3">Rezervace ({reservations.length})</h2>
        {reservations.length === 0 ? (
          <p className="text-sm text-slate-500">Pro zvolený filtr nejsou žádné rezervace.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Místo</th>
                  <th>Čas</th>
                  <th>Kantor</th>
                  <th>SPZ</th>
                  <th>Stav</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => (
                  <Fragment key={r.id}>
                    <tr className={r.status === 'CANCELLED' ? 'opacity-50' : ''}>
                      <td className="whitespace-nowrap">{dayLabel(r.date)}</td>
                      <td className="font-semibold">č. {r.spotCode}</td>
                      <td className="whitespace-nowrap">
                        {hm(r.startMinute)}–{hm(r.endMinute % 1440)}
                        {r.endMinute > 1440 && ' +1'}
                      </td>
                      <td>
                        {r.userName}
                        <span className="block text-xs text-slate-400">{r.userEmail}</span>
                      </td>
                      <td className="font-mono text-xs">{r.plates || '—'}</td>
                      <td>
                        {r.status === 'ACTIVE' ? (
                          <span className="badge bg-emerald-100 text-emerald-700">aktivní</span>
                        ) : (
                          <span className="badge bg-slate-100 text-slate-600">zrušeno</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {r.status === 'ACTIVE' && (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditing(editing === r.id ? null : r.id)}
                              className="btn-secondary btn-sm"
                            >
                              {editing === r.id ? 'Zavřít' : 'Upravit'}
                            </button>
                            <form
                              action={cancelAction}
                              onSubmit={(event) => {
                                if (!confirm(`Zrušit rezervaci ${r.userName}?`))
                                  event.preventDefault();
                              }}
                            >
                              <input type="hidden" name="id" value={r.id} />
                              <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
                                Zrušit
                              </SubmitButton>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                    {editing === r.id && (
                      <tr>
                        <td colSpan={7} className="bg-slate-50">
                          <form action={editAction} className="flex flex-wrap items-end gap-3 py-2">
                            <input type="hidden" name="id" value={r.id} />
                            <div>
                              <label className="label">Místo</label>
                              <select name="spotId" defaultValue={r.spotId} className="field">
                                {spots.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    č. {s.code}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="label">Datum</label>
                              <input name="date" type="date" defaultValue={r.date} className="field" />
                            </div>
                            <div>
                              <label className="label">Od</label>
                              <input
                                name="start"
                                type="time"
                                defaultValue={hm(r.startMinute)}
                                className="field"
                              />
                            </div>
                            <div>
                              <label className="label">Do</label>
                              <input
                                name="end"
                                type="time"
                                defaultValue={hm(Math.min(r.endMinute, 1439))}
                                className="field"
                              />
                            </div>
                            <SubmitButton>Uložit změnu</SubmitButton>
                            <span className="text-xs text-slate-500">
                              Kantorovi se odešle e-mail o změně.
                            </span>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
