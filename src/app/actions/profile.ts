'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser, hashPassword, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatPlate, isValidPlate, normalizePlate } from '@/lib/plates';

export type ProfileFormState = { error?: string; success?: string };

const profileSchema = z.object({
  name: z.string().trim().min(3, 'Zadejte celé jméno.').max(80),
  phone: z.string().trim().max(30).optional(),
});

export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Nejste přihlášeni.' };

  const parsed = profileSchema.safeParse({
    name: formData.get('name'),
    phone: formData.get('phone') ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Zkontrolujte zadané údaje.' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name, phone: parsed.data.phone || null },
  });
  revalidatePath('/profil');
  return { success: 'Údaje byly uloženy.' };
}

export async function addPlateAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Nejste přihlášeni.' };

  const input = String(formData.get('plate') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  if (!isValidPlate(input)) {
    return { error: 'SPZ musí mít 5–10 znaků (písmena a číslice).' };
  }
  const plate = normalizePlate(input);

  const existing = await prisma.plate.findUnique({
    where: { plate },
    select: { userId: true },
  });
  if (existing) {
    return {
      error:
        existing.userId === user.id
          ? 'Tuto SPZ už máte uloženou.'
          : 'Tato SPZ je evidovaná u jiného uživatele. Obraťte se na správce.',
    };
  }

  if ((await prisma.plate.count({ where: { userId: user.id } })) >= 5) {
    return { error: 'Lze evidovat nejvýše 5 vozidel.' };
  }

  await prisma.plate.create({
    data: { plate, display: formatPlate(input), note: note || null, userId: user.id },
  });
  revalidatePath('/profil');
  return { success: `SPZ ${formatPlate(input)} byla přidána.` };
}

export async function removePlateAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Nejste přihlášeni.' };

  const id = String(formData.get('id') ?? '');
  const plate = await prisma.plate.findUnique({ where: { id } });
  if (!plate || plate.userId !== user.id) return { error: 'SPZ nebyla nalezena.' };

  if ((await prisma.plate.count({ where: { userId: user.id } })) <= 1) {
    return { error: 'Musíte mít uloženou alespoň jednu SPZ.' };
  }

  await prisma.plate.delete({ where: { id } });
  revalidatePath('/profil');
  return { success: 'SPZ byla odebrána.' };
}

const passwordSchema = z
  .object({
    current: z.string().min(1, 'Zadejte současné heslo.'),
    next: z.string().min(8, 'Nové heslo musí mít alespoň 8 znaků.').max(200),
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, {
    message: 'Nová hesla se neshodují.',
    path: ['confirm'],
  });

export async function changePasswordAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Nejste přihlášeni.' };

  const parsed = passwordSchema.safeParse({
    current: formData.get('current'),
    next: formData.get('next'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Zkontrolujte zadané údaje.' };
  }

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!record || !verifyPassword(parsed.data.current, record.passwordHash)) {
    return { error: 'Současné heslo není správné.' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(parsed.data.next) },
  });
  return { success: 'Heslo bylo změněno.' };
}
