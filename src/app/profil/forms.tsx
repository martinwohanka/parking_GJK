'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addPlateAction,
  changePasswordAction,
  removePlateAction,
  updateProfileAction,
  type ProfileFormState,
} from '@/app/actions/profile';
import { Alert } from '@/components/Alert';
import { SubmitButton } from '@/components/SubmitButton';

const initial: ProfileFormState = {};

export function ProfileForm({
  name,
  phone,
  email,
}: {
  name: string;
  phone: string;
  email: string;
}) {
  const [state, action] = useActionState(updateProfileAction, initial);
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Jméno a příjmení
          </label>
          <input id="name" name="name" defaultValue={name} required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            Telefon
          </label>
          <input id="phone" name="phone" type="tel" defaultValue={phone} className="field" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="email-ro">
          Školní e-mail
        </label>
        <input id="email-ro" value={email} disabled className="field" />
        <p className="hint">E-mail nelze změnit, slouží jako přihlašovací jméno.</p>
      </div>
      <SubmitButton>Uložit údaje</SubmitButton>
    </form>
  );
}

export function PlateManager({
  plates,
}: {
  plates: { id: string; display: string; note: string | null }[];
}) {
  const router = useRouter();
  const [addState, addAction] = useActionState(
    async (prev: ProfileFormState, formData: FormData) => {
      const result = await addPlateAction(prev, formData);
      if (result.success) router.refresh();
      return result;
    },
    initial,
  );
  const [removeState, removeAction] = useActionState(
    async (prev: ProfileFormState, formData: FormData) => {
      const result = await removePlateAction(prev, formData);
      if (result.success) router.refresh();
      return result;
    },
    initial,
  );

  return (
    <div className="space-y-4">
      {addState.error && <Alert kind="error">{addState.error}</Alert>}
      {addState.success && <Alert kind="success">{addState.success}</Alert>}
      {removeState.error && <Alert kind="error">{removeState.error}</Alert>}

      <ul className="space-y-2">
        {plates.map((plate) => (
          <li
            key={plate.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
          >
            <div>
              <span className="font-mono text-sm font-semibold tracking-wider">
                {plate.display}
              </span>
              {plate.note && <span className="ml-2 text-xs text-slate-500">{plate.note}</span>}
            </div>
            <form action={removeAction}>
              <input type="hidden" name="id" value={plate.id} />
              <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
                Odebrat
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>

      <form action={addAction} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[9rem] flex-1">
          <label className="label" htmlFor="plate">
            Nová SPZ
          </label>
          <input id="plate" name="plate" placeholder="1AB 2345" className="field uppercase" required />
        </div>
        <div className="min-w-[9rem] flex-1">
          <label className="label" htmlFor="note">
            Popis vozidla
          </label>
          <input id="note" name="note" placeholder="např. modrá Octavia" className="field" />
        </div>
        <SubmitButton className="btn-secondary">Přidat SPZ</SubmitButton>
      </form>
    </div>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initial);
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="current">
            Současné heslo
          </label>
          <input id="current" name="current" type="password" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="next">
            Nové heslo
          </label>
          <input id="next" name="next" type="password" minLength={8} required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="confirm">
            Nové heslo znovu
          </label>
          <input id="confirm" name="confirm" type="password" minLength={8} required className="field" />
        </div>
      </div>
      <SubmitButton className="btn-secondary">Změnit heslo</SubmitButton>
    </form>
  );
}
