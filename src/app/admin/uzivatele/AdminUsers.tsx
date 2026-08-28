'use client';

import { Fragment, useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminAddPlateAction,
  adminAdjustTokensAction,
  adminRemovePlateAction,
  adminResetPasswordAction,
  adminUpdateUserAction,
  type AdminFormState,
} from '@/app/actions/admin';
import { Alert } from '@/components/Alert';
import { SubmitButton } from '@/components/SubmitButton';

const initial: AdminFormState = {};

type Row = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  reservationCount: number;
  plates: { id: string; display: string }[];
  penaltyPoints: number;
  totalTokens: number;
  usedTokens: number;
  adjustment: number;
  isBlocked: boolean;
};

export function AdminUsers({
  users,
  currentUserId,
}: {
  users: Row[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const refresh = (result: AdminFormState) => {
    if (result.success) router.refresh();
    return result;
  };

  const [userState, userAction] = useActionState(
    async (prev: AdminFormState, fd: FormData) => refresh(await adminUpdateUserAction(prev, fd)),
    initial,
  );
  const [tokenState, tokenAction] = useActionState(
    async (prev: AdminFormState, fd: FormData) => refresh(await adminAdjustTokensAction(prev, fd)),
    initial,
  );
  const [plateState, plateAction] = useActionState(
    async (prev: AdminFormState, fd: FormData) => refresh(await adminAddPlateAction(prev, fd)),
    initial,
  );
  const [removeState, removeAction] = useActionState(
    async (prev: AdminFormState, fd: FormData) => refresh(await adminRemovePlateAction(prev, fd)),
    initial,
  );
  const [passwordState, passwordAction] = useActionState(adminResetPasswordAction, initial);

  const filtered = users.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.plates.some((p) => p.display.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4">
      {[userState, tokenState, plateState, removeState, passwordState].map((state, index) => (
        <Fragment key={index}>
          {state.error && <Alert kind="error">{state.error}</Alert>}
          {state.success && <Alert kind="success">{state.success}</Alert>}
        </Fragment>
      ))}

      <div className="card card-pad">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Hledat podle jména, e-mailu nebo SPZ…"
          className="field"
        />
      </div>

      <div className="card card-pad">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Kantor</th>
                <th>SPZ</th>
                <th>Role</th>
                <th className="text-center">Tokeny</th>
                <th className="text-center">Body</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <Fragment key={u.id}>
                  <tr className={u.isActive ? '' : 'opacity-50'}>
                    <td>
                      <span className="font-medium">{u.name}</span>
                      <span className="block text-xs text-slate-400">{u.email}</span>
                    </td>
                    <td className="font-mono text-xs">
                      {u.plates.map((p) => p.display).join(', ') || '—'}
                    </td>
                    <td>
                      {u.role === 'ADMIN' ? (
                        <span className="badge bg-brand-100 text-brand-700">správce</span>
                      ) : (
                        <span className="badge bg-slate-100 text-slate-600">kantor</span>
                      )}
                      {!u.isActive && (
                        <span className="badge ml-1 bg-slate-200 text-slate-600">neaktivní</span>
                      )}
                    </td>
                    <td className="text-center whitespace-nowrap">
                      {u.usedTokens} / {u.totalTokens}
                      {u.adjustment !== 0 && (
                        <span className="block text-[10px] text-slate-400">
                          úprava {u.adjustment > 0 ? `+${u.adjustment}` : u.adjustment}
                        </span>
                      )}
                    </td>
                    <td className="text-center">
                      <span
                        className={`badge ${
                          u.isBlocked
                            ? 'bg-red-100 text-red-700'
                            : u.penaltyPoints > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {u.penaltyPoints}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => setOpen(open === u.id ? null : u.id)}
                        className="btn-secondary btn-sm"
                      >
                        {open === u.id ? 'Zavřít' : 'Detail'}
                      </button>
                    </td>
                  </tr>

                  {open === u.id && (
                    <tr>
                      <td colSpan={6} className="bg-slate-50">
                        <div className="grid gap-5 py-3 lg:grid-cols-2">
                          <div>
                            <h3 className="mb-2 text-sm font-semibold">Účet</h3>
                            <form action={userAction} className="space-y-3">
                              <input type="hidden" name="id" value={u.id} />
                              <div>
                                <label className="label">Jméno</label>
                                <input name="name" defaultValue={u.name} className="field" />
                              </div>
                              <div className="flex flex-wrap items-end gap-3">
                                <div>
                                  <label className="label">Role</label>
                                  <select name="role" defaultValue={u.role} className="field">
                                    <option value="TEACHER">kantor</option>
                                    <option value="ADMIN">správce</option>
                                  </select>
                                </div>
                                <label className="flex items-center gap-2 pb-3 text-sm">
                                  <input
                                    type="checkbox"
                                    name="isActive"
                                    defaultChecked={u.isActive}
                                    className="h-4 w-4"
                                  />
                                  aktivní účet
                                </label>
                                <SubmitButton className="btn-secondary mb-1">Uložit</SubmitButton>
                              </div>
                              {u.id === currentUserId && (
                                <p className="hint">Toto je váš vlastní účet.</p>
                              )}
                            </form>

                            <h3 className="mb-2 mt-5 text-sm font-semibold">Nastavit heslo</h3>
                            <form action={passwordAction} className="flex flex-wrap items-end gap-3">
                              <input type="hidden" name="id" value={u.id} />
                              <div className="flex-1">
                                <input
                                  name="password"
                                  type="text"
                                  minLength={8}
                                  placeholder="nové heslo (min. 8 znaků)"
                                  className="field"
                                />
                              </div>
                              <SubmitButton className="btn-secondary">Nastavit</SubmitButton>
                            </form>
                          </div>

                          <div>
                            <h3 className="mb-2 text-sm font-semibold">Vozidla (SPZ)</h3>
                            <ul className="mb-3 space-y-1.5">
                              {u.plates.map((plate) => (
                                <li
                                  key={plate.id}
                                  className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200"
                                >
                                  <span className="font-mono text-sm">{plate.display}</span>
                                  <form action={removeAction}>
                                    <input type="hidden" name="id" value={plate.id} />
                                    <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
                                      Odebrat
                                    </SubmitButton>
                                  </form>
                                </li>
                              ))}
                              {u.plates.length === 0 && (
                                <li className="text-sm text-slate-500">Žádná evidovaná SPZ.</li>
                              )}
                            </ul>
                            <form action={plateAction} className="flex flex-wrap items-end gap-2">
                              <input type="hidden" name="userId" value={u.id} />
                              <input
                                name="plate"
                                placeholder="1AB 2345"
                                className="field uppercase flex-1"
                              />
                              <SubmitButton className="btn-secondary">Přidat SPZ</SubmitButton>
                            </form>

                            <h3 className="mb-2 mt-5 text-sm font-semibold">
                              Úprava týdenního přídělu
                            </h3>
                            <form action={tokenAction} className="flex flex-wrap items-end gap-2">
                              <input type="hidden" name="userId" value={u.id} />
                              <div className="w-24">
                                <input
                                  name="amount"
                                  type="number"
                                  step={1}
                                  min={-20}
                                  max={20}
                                  placeholder="+1"
                                  className="field"
                                />
                              </div>
                              <input
                                name="reason"
                                placeholder="důvod (nepovinné)"
                                className="field flex-1"
                              />
                              <SubmitButton className="btn-secondary">Upravit</SubmitButton>
                            </form>
                            <p className="hint">
                              Kladné číslo příděl zvyšuje, záporné snižuje. Úpravy se sčítají.
                            </p>

                            <p className="mt-4 text-xs text-slate-500">
                              Registrace {u.createdAt} • celkem {u.reservationCount} rezervací
                              {u.phone ? ` • tel. ${u.phone}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
