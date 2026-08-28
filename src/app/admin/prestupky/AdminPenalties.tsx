'use client';

import { Fragment, useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminResolvePenaltyAction, type AdminFormState } from '@/app/actions/admin';
import { Alert } from '@/components/Alert';
import { SubmitButton } from '@/components/SubmitButton';

const initial: AdminFormState = {};

type Report = {
  id: string;
  plate: string;
  reason: string;
  points: number;
  status: string;
  occurredAt: string;
  targetName: string | null;
  targetEmail: string | null;
  reporterName: string;
  resolvedByName: string | null;
  resolutionNote: string | null;
};

const STATUS: Record<string, { text: string; className: string }> = {
  PENDING: { text: 'ke schválení', className: 'bg-amber-100 text-amber-800' },
  CONFIRMED: { text: 'potvrzeno', className: 'bg-red-100 text-red-700' },
  REJECTED: { text: 'zamítnuto', className: 'bg-slate-100 text-slate-600' },
};

export function AdminPenalties({ reports }: { reports: Report[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [state, action] = useActionState(
    async (prev: AdminFormState, fd: FormData) => {
      const result = await adminResolvePenaltyAction(prev, fd);
      if (result.success) {
        setOpen(null);
        router.refresh();
      }
      return result;
    },
    initial,
  );

  const pending = reports.filter((r) => r.status === 'PENDING');
  const resolved = reports.filter((r) => r.status !== 'PENDING');

  const renderRow = (report: Report) => (
    <Fragment key={report.id}>
      <tr>
        <td className="whitespace-nowrap font-mono font-semibold">{report.plate}</td>
        <td>
          {report.targetName ?? <span className="text-slate-400">neznámý majitel</span>}
          {report.targetEmail && (
            <span className="block text-xs text-slate-400">{report.targetEmail}</span>
          )}
        </td>
        <td className="max-w-[20rem] text-sm">{report.reason}</td>
        <td className="whitespace-nowrap text-xs text-slate-500">
          {report.occurredAt}
          <span className="block">nahlásil: {report.reporterName}</span>
        </td>
        <td className="text-center">{report.status === 'CONFIRMED' ? report.points : '—'}</td>
        <td>
          <span className={`badge ${STATUS[report.status].className}`}>
            {STATUS[report.status].text}
          </span>
          {report.resolvedByName && (
            <span className="block text-[10px] text-slate-400">{report.resolvedByName}</span>
          )}
        </td>
        <td className="text-right">
          {report.status === 'PENDING' && (
            <button
              type="button"
              onClick={() => setOpen(open === report.id ? null : report.id)}
              className="btn-secondary btn-sm"
            >
              {open === report.id ? 'Zavřít' : 'Posoudit'}
            </button>
          )}
        </td>
      </tr>
      {open === report.id && (
        <tr>
          <td colSpan={7} className="bg-slate-50">
            <div className="flex flex-wrap items-end gap-3 py-3">
              <form action={action} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={report.id} />
                <input type="hidden" name="decision" value="CONFIRMED" />
                <div className="w-24">
                  <label className="label">Body</label>
                  <input
                    name="points"
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={1}
                    className="field"
                  />
                </div>
                <div className="min-w-[12rem] flex-1">
                  <label className="label">Poznámka správce</label>
                  <input name="note" className="field" placeholder="nepovinné" />
                </div>
                <SubmitButton className="btn-primary">Potvrdit body</SubmitButton>
              </form>
              <form action={action}>
                <input type="hidden" name="id" value={report.id} />
                <input type="hidden" name="decision" value="REJECTED" />
                <SubmitButton className="btn-secondary">Zamítnout</SubmitButton>
              </form>
            </div>
            {!report.targetName && (
              <p className="pb-3 text-xs text-amber-700">
                Tato SPZ není přiřazena žádnému uživateli – body se nikomu nepřipíšou, dokud si
                majitel SPZ nezaregistruje.
              </p>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );

  return (
    <div className="space-y-5">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}

      <div className="card card-pad">
        <h2 className="section-title mb-3">Ke schválení ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">Žádná nová nahlášení.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SPZ</th>
                  <th>Majitel</th>
                  <th>Důvod</th>
                  <th>Kdy / kdo</th>
                  <th className="text-center">Body</th>
                  <th>Stav</th>
                  <th />
                </tr>
              </thead>
              <tbody>{pending.map(renderRow)}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card card-pad">
        <h2 className="section-title mb-3">Vyřízená nahlášení ({resolved.length})</h2>
        {resolved.length === 0 ? (
          <p className="text-sm text-slate-500">Zatím nic vyřízeného.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SPZ</th>
                  <th>Majitel</th>
                  <th>Důvod</th>
                  <th>Kdy / kdo</th>
                  <th className="text-center">Body</th>
                  <th>Stav</th>
                  <th />
                </tr>
              </thead>
              <tbody>{resolved.map(renderRow)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
