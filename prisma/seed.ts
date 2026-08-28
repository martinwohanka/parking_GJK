/**
 * Naplní databázi výchozími daty: nastavení, parkovací místa podle plánku
 * parkoviště a účet správce.
 *
 * Spuštění:  npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

/**
 * Rozmístění podle plánku:
 *  - sekce RIGHT (u zdi): místa 1–7 shora dolů,
 *  - sekce LEFT (u vstupu do budovy): místa 8–10 shora dolů, dole výjezd.
 */
const SPOTS = [
  { code: '1', section: 'RIGHT', position: 1, label: 'U vjezdu', note: 'Na plánku vyšrafováno – před spuštěním ověřit v terénu a fyzicky označit.' },
  { code: '2', section: 'RIGHT', position: 2, label: null, note: null },
  { code: '3', section: 'RIGHT', position: 3, label: null, note: null },
  { code: '4', section: 'RIGHT', position: 4, label: null, note: null },
  { code: '5', section: 'RIGHT', position: 5, label: null, note: null },
  { code: '6', section: 'RIGHT', position: 6, label: null, note: null },
  { code: '7', section: 'RIGHT', position: 7, label: 'U výjezdu', note: null },
  { code: '8', section: 'LEFT', position: 1, label: 'U vstupu do budovy', note: null },
  { code: '9', section: 'LEFT', position: 2, label: null, note: null },
  { code: '10', section: 'LEFT', position: 3, label: null, note: null },
];

async function main() {
  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      noticeText:
        'Parkoviště je určeno pro pedagogické pracovníky GJK. Rezervujte si prosím pouze čas, kdy vůz skutečně stojí na parkovišti, a parkujte v rámci vyznačeného místa.',
    },
  });

  for (const spot of SPOTS) {
    await prisma.parkingSpot.upsert({
      where: { code: spot.code },
      update: { section: spot.section, position: spot.position, label: spot.label },
      create: spot,
    });
  }

  const email = (process.env.ADMIN_EMAIL ?? 'admin@gjk.cz').toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'Parkoviste123';
  const name = process.env.ADMIN_NAME ?? 'Správce parkoviště';

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', isActive: true },
    create: { email, name, role: 'ADMIN', passwordHash: hashPassword(password) },
  });

  console.log(`✔ Nastavení a ${SPOTS.length} parkovacích míst připraveno.`);
  console.log(`✔ Správce: ${admin.email} (heslo z ADMIN_PASSWORD)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
