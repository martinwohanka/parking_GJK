'use client';

import { useActionState } from 'react';
import { loginAction, type FormState } from '@/app/actions/auth';
import { Alert } from '@/components/Alert';
import { SubmitButton } from '@/components/SubmitButton';

const initial: FormState = {};

export function LoginForm() {
  const [state, action] = useActionState(loginAction, initial);

  return (
    <form action={action} className="space-y-4">
      <Alert kind="error">{state.error}</Alert>

      <div>
        <label className="label" htmlFor="email">
          Školní e-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="jmeno@gjk.cz"
          defaultValue={state.values?.email ?? ''}
          className="field"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Heslo
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="field"
        />
      </div>

      <SubmitButton className="btn-primary w-full" pendingLabel="Přihlašuji…">
        Přihlásit se
      </SubmitButton>
    </form>
  );
}
