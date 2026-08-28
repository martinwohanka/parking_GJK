'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import {
  reportBadParkingAction,
  type PenaltyFormState,
} from '@/app/actions/penalties';
import { Alert } from '@/components/Alert';
import { SubmitButton } from '@/components/SubmitButton';

const initial: PenaltyFormState = {};

export function ReportForm() {
  const router = useRouter();
  const [state, action] = useActionState(
    async (prev: PenaltyFormState, formData: FormData) => {
      const result = await reportBadParkingAction(prev, formData);
      if (result.success) router.refresh();
      return result;
    },
    initial,
  );

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="plate">
            SPZ vozidla
          </label>
          <input
            id="plate"
            name="plate"
            required
            placeholder="1AB 2345"
            defaultValue={state.values?.plate ?? ''}
            className="field uppercase font-mono"
          />
        </div>
        <div>
          <label className="label" htmlFor="occurredAt">
            Kdy k tomu došlo
          </label>
          <input
            id="occurredAt"
            name="occurredAt"
            type="datetime-local"
            defaultValue={state.values?.occurredAt ?? ''}
            className="field"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="reason">
          Co bylo špatně
        </label>
        <textarea
          id="reason"
          name="reason"
          required
          rows={3}
          maxLength={500}
          placeholder="např. vozidlo zabírá dvě místa / stojí na místě č. 4 bez rezervace / blokuje výjezd"
          defaultValue={state.values?.reason ?? ''}
          className="field"
        />
      </div>

      <SubmitButton pendingLabel="Odesílám…">Odeslat nahlášení</SubmitButton>
    </form>
  );
}
