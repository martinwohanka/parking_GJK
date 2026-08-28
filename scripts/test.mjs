/**
 * Spustí testy nad samostatnou testovací databází.
 *
 * Proměnná prostředí se nastavuje zde (ne v package.json), aby příkaz
 * `npm test` fungoval stejně na Windows, macOS i Linuxu.
 */
import { spawnSync } from 'node:child_process';

// Testy běží proti samostatné databázi, aby nesmazaly vývojová data.
// Adresu lze přepsat proměnnou TEST_DATABASE_URL (např. v CI).
const env = {
  ...process.env,
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgresql://postgres@127.0.0.1:5432/parkoviste_test?schema=public',
};

function run(args) {
  const result = spawnSync('npx', args, { stdio: 'inherit', env, shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss']);
run(['tsx', '--test', 'tests/logic.test.ts']);
