'use client';

import { useActionState } from 'react';
import { registerAction, type FormState } from '@/app/actions/auth';
import { Alert } from '@/components/Alert';
import { SubmitButton } from '@/components/SubmitButton';

const initial: FormState = {};

export function RegisterForm({ domain }: { domain: string }) {
  const [state, action] = useActionState(registerAction, initial);

  return (
    <form action={action} className="space-y-4">
      <Alert kind="error">{state.error}</Alert>

      <div>
        <label className="label" htmlFor="name">
          Jméno a příjmení
        </label>
        <input
          id="name"
          name="name"
          required
          autoComplete="name"
          defaultValue={state.values?.name ?? ''}
          className="field"
        />
      </div>

      <div>
        <label className="label" htmlFor="email">
          Školní e-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder={`jmeno@${domain}`}
          defaultValue={state.values?.email ?? ''}
          className="field"
        />
        <p className="hint">Registrace je povolena pouze pro adresy @{domain}.</p>
      </div>

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
          className="field uppercase"
        />
        <p className="hint">Další vozidla lze přidat později v profilu.</p>
      </div>

      <div>
        <label className="label" htmlFor="phone">
          Telefon <span className="font-normal text-slate-400">(nepovinné)</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={state.values?.phone ?? ''}
          className="field"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="password">
            Heslo
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="passwordConfirm">
            Heslo znovu
          </label>
          <input
            id="passwordConfirm"
            name="passwordConfirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="field"
          />
        </div>
      </div>

      <SubmitButton className="btn-primary w-full" pendingLabel="Registruji…">
        Zaregistrovat se
      </SubmitButton>
    </form>
  );
}
