'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import {
  cancelReservationAction,
  type ReservationFormState,
} from '@/app/actions/reservations';
import { SubmitButton } from '@/components/SubmitButton';

const initial: ReservationFormState = {};

export function CancelReservationButton({
  id,
  label = 'Zrušit',
}: {
  id: string;
  label?: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState(
    async (prev: ReservationFormState, formData: FormData) => {
      const result = await cancelReservationAction(prev, formData);
      if (result.success) router.refresh();
      return result;
    },
    initial,
  );

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm('Opravdu chcete rezervaci zrušit?')) event.preventDefault();
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
      <SubmitButton className="btn-danger btn-sm" pendingLabel="Ruším…">
        {label}
      </SubmitButton>
    </form>
  );
}
