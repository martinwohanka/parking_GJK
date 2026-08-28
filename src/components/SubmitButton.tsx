'use client';

import { useFormStatus } from 'react-dom';

export function SubmitButton({
  children,
  className = 'btn-primary',
  pendingLabel = 'Ukládám…',
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button {...rest} type="submit" disabled={pending || rest.disabled} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
