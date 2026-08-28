'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from '@/lib/auth';
import { sendMail, welcomeMail } from '@/lib/mail';
import { formatPlate, isValidPlate, normalizePlate } from '@/lib/plates';

export type FormState = {
  error?: string;
  success?: string;
  /**
   * Vyplněné hodnoty vrácené zpět do formuláře. React po odeslání formuláře
   * resetuje needitované položky na výchozí hodnoty, takže bez tohoto pole
   * by uživatel po chybě musel všechno vypsat znovu. Hesla se nevracejí.
   */
  values?: { name?: string; email?: string; plate?: string; phone?: string };
};

function allowedDomain(): string {
  return (process.env.ALLOWED_EMAIL_DOMAIN ?? 'gjk.cz').toLowerCase();
}

const registerSchema = z
  .object({
    name: z.string().trim().min(3, 'Zadejte celé jméno.').max(80),
    email: z.string().trim().toLowerCase().email('Zadejte platný e-mail.'),
    plate: z.string().trim().min(1, 'Zadejte SPZ vozidla.'),
    phone: z.string().trim().max(30).optional(),
    password: z.string().min(8, 'Heslo musí mít alespoň 8 znaků.').max(200),
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'Hesla se neshodují.',
    path: ['passwordConfirm'],
  });

export async function registerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    plate: formData.get('plate'),
    phone: formData.get('phone') ?? undefined,
    password: formData.get('password'),
    passwordConfirm: formData.get('passwordConfirm'),
  });

  const submitted = {
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    plate: String(formData.get('plate') ?? ''),
    phone: String(formData.get('phone') ?? ''),
  };
  const fail = (error: string): FormState => ({ error, values: submitted });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Zkontrolujte zadané údaje.');
  }
  const data = parsed.data;

  const domain = allowedDomain();
  if (!data.email.endsWith(`@${domain}`)) {
    return fail(`Registrace je možná pouze se školním e-mailem @${domain}.`);
  }

  if (!isValidPlate(data.plate)) {
    return fail('SPZ musí mít 5–10 znaků (písmena a číslice).');
  }
  const plate = normalizePlate(data.plate);

  const [existingUser, existingPlate] = await Promise.all([
    prisma.user.findUnique({ where: { email: data.email }, select: { id: true } }),
    prisma.plate.findUnique({ where: { plate }, select: { id: true } }),
  ]);
  if (existingUser) {
    return fail('Uživatel s tímto e-mailem je již zaregistrovaný.');
  }
  if (existingPlate) {
    return fail('Tato SPZ je již evidovaná u jiného uživatele.');
  }

  const isFirstUser = (await prisma.user.count()) === 0;

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      passwordHash: hashPassword(data.password),
      role: isFirstUser ? 'ADMIN' : 'TEACHER',
      plates: { create: { plate, display: formatPlate(data.plate) } },
    },
  });

  await sendMail(welcomeMail({ userName: user.name, userEmail: user.email }));
  await createSession(user.id);
  redirect('/?vitejte=1');
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Zadejte e-mail.'),
  password: z.string().min(1, 'Zadejte heslo.'),
});

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Zkontrolujte zadané údaje.',
      values: { email },
    };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const ok = user ? verifyPassword(parsed.data.password, user.passwordHash) : false;

  if (!user || !ok) {
    return { error: 'Nesprávný e-mail nebo heslo.', values: { email } };
  }
  if (!user.isActive) {
    return {
      error: 'Účet je deaktivovaný. Obraťte se na správce parkoviště.',
      values: { email },
    };
  }

  await createSession(user.id);
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/prihlaseni');
}
