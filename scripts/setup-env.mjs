/**
 * Připraví soubor .env pro lokální spuštění:
 *  - když .env chybí, vytvoří ho z .env.example,
 *  - když v něm chybí SESSION_SECRET (nebo je tam ještě text z předlohy),
 *    vygeneruje náhodný klíč a doplní ho.
 *
 * Existující vlastní hodnoty nikdy nepřepisuje, takže se dá pouštět opakovaně.
 * Volá se automaticky z `npm run setup`.
 */
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const ENV = '.env';
const EXAMPLE = '.env.example';
const PLACEHOLDER = 'zmente-me-na-nahodny-retezec-alespon-32-znaku';

if (!existsSync(ENV)) {
  if (!existsSync(EXAMPLE)) {
    console.error(`✖ Chybí ${EXAMPLE}, soubor ${ENV} nelze vytvořit.`);
    process.exit(1);
  }
  copyFileSync(EXAMPLE, ENV);
  console.log(`✔ Vytvořen soubor ${ENV} podle ${EXAMPLE}.`);
}

const content = readFileSync(ENV, 'utf8');
const match = /^SESSION_SECRET\s*=\s*(.*)$/m.exec(content);
const current = match ? match[1].trim().replace(/^["']|["']$/g, '') : '';

if (current && current !== PLACEHOLDER && current.length >= 16) {
  console.log('✔ SESSION_SECRET je už nastavený, ponechávám beze změny.');
} else {
  const secret = randomBytes(48).toString('base64');
  const line = `SESSION_SECRET="${secret}"`;
  const updated = match
    ? content.replace(/^SESSION_SECRET\s*=.*$/m, line)
    : `${content.trimEnd()}\n${line}\n`;
  writeFileSync(ENV, updated, 'utf8');
  console.log('✔ Vygenerován nový SESSION_SECRET a zapsán do .env.');
}

// Bez adresy databáze nemá smysl pokračovat – Prisma by skončila
// nesrozumitelnou chybou P1012 o chybějící proměnné DATABASE_URL.
const database = /^DATABASE_URL\s*=\s*(.*)$/m.exec(readFileSync(ENV, 'utf8'));
const databaseUrl = database ? database[1].trim().replace(/^["']|["']$/g, '') : '';

if (!databaseUrl) {
  console.error(
    [
      '',
      '✖ V souboru .env chybí adresa databáze (DATABASE_URL).',
      '',
      '  1. Založte si bezplatnou databázi na https://neon.tech',
      '  2. Zkopírujte "connection string" (začíná postgresql://…).',
      '  3. Vložte ho v souboru .env na řádek DATABASE_URL="…".',
      '  4. Spusťte znovu: npm run setup',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

console.log('✔ Adresa databáze je vyplněná.');
