'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatPlate, isValidPlate, normalizePlate } from '@/lib/plates';

export type PenaltyFormState = {
  error?: string;
  success?: string;
  /** Vyplněné hodnoty vrácené do formuláře, aby se po chybě nemazaly. */
  values?: { plate?: string; reason?: string; occurredAt?: string };
};

const reportSchema = z.object({
  plate: z.string().trim().min(1, 'Zadejte SPZ špatně zaparkovaného vozidla.'),
  reason: z.string().trim().min(5, 'Popište prosím, co bylo špatně (min. 5 znaků).').max(500),
  occurredAt: z.string().optional(),
});

/**
 * Nahlášení špatně zaparkovaného vozidla. Nahlášení je vždy ve stavu
 * „ke schválení“ – trestné body se započtou až po potvrzení správcem.
 */
export async function reportBadParkingAction(
  _prev: PenaltyFormState,
  formData: FormData,
): Promise<PenaltyFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Nejste přihlášeni.' };

  const parsed = reportSchema.safeParse({
    plate: formData.get('plate'),
    reason: formData.get('reason'),
    occurredAt: formData.get('occurredAt') ?? undefined,
  });
  const submitted = {
    plate: String(formData.get('plate') ?? ''),
    reason: String(formData.get('reason') ?? ''),
    occurredAt: String(formData.get('occurredAt') ?? ''),
  };
  const fail = (error: string): PenaltyFormState => ({ error, values: submitted });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Zkontrolujte zadané údaje.');
  }
  if (!isValidPlate(parsed.data.plate)) {
    return fail('SPZ musí mít 5–10 znaků (písmena a číslice).');
  }

  const plate = normalizePlate(parsed.data.plate);
  const owner = await prisma.plate.findUnique({
    where: { plate },
    select: { userId: true },
  });

  if (owner?.userId === user.id) {
    return fail('Nelze nahlásit vlastní vozidlo.');
  }

  let occurredAt = new Date();
  if (parsed.data.occurredAt) {
    const parsedDate = new Date(parsed.data.occurredAt);
    if (!Number.isNaN(parsedDate.getTime()) && parsedDate.getTime() <= Date.now() + 3_600_000) {
      occurredAt = parsedDate;
    }
  }

  // Ochrana proti opakovanému hlášení téhož od téhož člověka během 12 hodin.
  const recent = await prisma.penaltyReport.findFirst({
    where: {
      plate,
      reportedById: user.id,
      createdAt: { gte: new Date(Date.now() - 12 * 3_600_000) },
    },
    select: { id: true },
  });
  if (recent) {
    return fail('Toto vozidlo jste už nahlásili během posledních 12 hodin.');
  }

  await prisma.penaltyReport.create({
    data: {
      plate,
      plateInput: formatPlate(parsed.data.plate),
      reason: parsed.data.reason,
      occurredAt,
      reportedById: user.id,
      targetUserId: owner?.userId ?? null,
      points: 1,
      status: 'PENDING',
    },
  });

  revalidatePath('/prestupky');
  revalidatePath('/admin/prestupky');

  return {
    success: owner
      ? 'Nahlášení bylo odesláno správci ke schválení. Děkujeme.'
      : 'Nahlášení bylo odesláno. SPZ zatím není v systému evidována – posoudí ji správce.',
  };
}
