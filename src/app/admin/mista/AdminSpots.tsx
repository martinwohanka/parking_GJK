'use client';

import { Fragment, useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminDeleteSpotAction,
  adminSaveSpotAction,
  type AdminFormState,
} from '@/app/actions/admin';
import { Alert } from '@/components/Alert';
import { SubmitButton } from '@/components/SubmitButton';

const initial: AdminFormState = {};

type Spot = {
  id: string;
  code: string;
  label: string | null;
  note: string | null;
  section: string;
  position: number;
  isActive: boolean;
  upcoming: number;
};

function SpotForm({
  spot,
  action,
  onDone,
}: {
  spot?: Spot;
  action: (payload: FormData) => void;
  onDone?: () => void;
}) {
  return (
    <form action={action} onSubmit={onDone} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <input type="hidden" name="id" value={spot?.id ?? ''} />
      <div>
        <label className="label">Označení</label>
        <input name="code" defaultValue={spot?.code ?? ''} required className="field" />
      </div>
      <div>
        <label className="label">Sekce</label>
        <select name="section" defaultValue={spot?.section ?? 'RIGHT'} className="field">
          <option value="LEFT">u vstupu do budovy</option>
          <option value="RIGHT">podél zdi</option>
        </select>
      </div>
      <div>
        <label className="label">Pořadí</label>
        <input
          name="position"
          type="number"
          min={0}
          max={99}
          defaultValue={spot?.position ?? 0}
          className="field"
        />
      </div>
      <div>
        <label className="label">Popis</label>
        <input name="label" defaultValue={spot?.label ?? ''} className="field" />
      </div>
      <div className="lg:col-span-2">
        <label className="label">Poznámka</label>
        <input name="note" defaultValue={spot?.note ?? ''} className="field" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={spot?.isActive ?? true}
            className="h-4 w-4"
          />
          místo je v provozu
        </label>
        <SubmitButton>{spot ? 'Uložit změny' : 'Přidat místo'}</SubmitButton>
      </div>
    </form>
  );
}

export function AdminSpots({ spots }: { spots: Spot[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const [saveState, saveAction] = useActionState(
    async (prev: AdminFormState, fd: FormData) => {
      const result = await adminSaveSpotAction(prev, fd);
      if (result.success) {
        setEditing(null);
        setShowNew(false);
        router.refresh();
      }
      return result;
    },
    initial,
  );

  const [deleteState, deleteAction] = useActionState(
    async (prev: AdminFormState, fd: FormData) => {
      const result = await adminDeleteSpotAction(prev, fd);
      if (result.success) router.refresh();
      return result;
    },
    initial,
  );

  return (
    <div className="space-y-4">
      {saveState.error && <Alert kind="error">{saveState.error}</Alert>}
      {saveState.success && <Alert kind="success">{saveState.success}</Alert>}
      {deleteState.error && <Alert kind="error">{deleteState.error}</Alert>}
      {deleteState.success && <Alert kind="success">{deleteState.success}</Alert>}

      <div className="card card-pad">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="section-title">Seznam míst ({spots.length})</h2>
          <button type="button" onClick={() => setShowNew((v) => !v)} className="btn-primary btn-sm">
            {showNew ? 'Zavřít' : '+ Nové místo'}
          </button>
        </div>

        {showNew && (
          <div className="mb-4 rounded-lg bg-slate-50 p-4">
            <SpotForm action={saveAction} />
          </div>
        )}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Místo</th>
                <th>Sekce</th>
                <th className="text-center">Pořadí</th>
                <th>Poznámka</th>
                <th className="text-center">Rezervace</th>
                <th>Stav</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {spots.map((spot) => (
                <Fragment key={spot.id}>
                  <tr className={spot.isActive ? '' : 'opacity-50'}>
                    <td className="font-semibold">
                      č. {spot.code}
                      {spot.label && (
                        <span className="block text-xs font-normal text-slate-400">
                          {spot.label}
                        </span>
                      )}
                    </td>
                    <td className="text-sm text-slate-600">
                      {spot.section === 'LEFT' ? 'u vstupu' : 'podél zdi'}
                    </td>
                    <td className="text-center">{spot.position}</td>
                    <td className="max-w-[18rem] text-xs text-slate-500">{spot.note ?? '—'}</td>
                    <td className="text-center">{spot.upcoming}</td>
                    <td>
                      {spot.isActive ? (
                        <span className="badge bg-emerald-100 text-emerald-700">v provozu</span>
                      ) : (
                        <span className="badge bg-slate-100 text-slate-600">mimo provoz</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(editing === spot.id ? null : spot.id)}
                          className="btn-secondary btn-sm"
                        >
                          {editing === spot.id ? 'Zavřít' : 'Upravit'}
                        </button>
                        <form
                          action={deleteAction}
                          onSubmit={(event) => {
                            if (!confirm(`Opravdu smazat místo č. ${spot.code}?`))
                              event.preventDefault();
                          }}
                        >
                          <input type="hidden" name="id" value={spot.id} />
                          <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
                            Smazat
                          </SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                  {editing === spot.id && (
                    <tr>
                      <td colSpan={7} className="bg-slate-50">
                        <div className="py-3">
                          <SpotForm spot={spot} action={saveAction} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Místo s aktivními rezervacemi nelze smazat – nejprve rezervace zrušte, nebo místo pouze
          deaktivujte (např. při opravě povrchu). Označení míst doporučujeme fyzicky vyznačit i na
          parkovišti, aby odpovídalo plánku v aplikaci.
        </p>
      </div>
    </div>
  );
}
