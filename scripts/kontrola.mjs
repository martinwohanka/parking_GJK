/**
 * Rychlá kontrola aplikace před nasazením.
 *
 * Aplikace se na web nahrává automaticky, takže překlep v JavaScriptu by se
 * jinak projevil až bílou stránkou u kantorů. Tahle kontrola ověří, že se
 * skript v index.html vůbec přeloží a že v souboru nezůstal servisní klíč.
 *
 * Spuštění:  node scripts/kontrola.mjs
 */
import { readFileSync } from 'node:fs';

const FILE = 'web/index.html';
const html = readFileSync(FILE, 'utf8');
const problems = [];

// 1) JavaScript se musí přeložit
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!script) {
  problems.push('V souboru chybí blok <script type="module">.');
} else {
  try {
    // dynamický import nelze vyhodnotit mimo modul, pro kontrolu syntaxe stačí nahradit
    new Function(script[1].replace(/await import\(/g, 'Promise.resolve('));
  } catch (error) {
    problems.push(`Chyba v JavaScriptu: ${error.message}`);
  }
}

// 2) do prohlížeče nesmí servisní klíč
if (/service_role|sb_secret_/.test(html)) {
  problems.push('V souboru je servisní klíč Supabase – ten do prohlížeče nepatří.');
}

// 3) nasazovat se má ostrá konfigurace, ne ukázkový režim
if (/url:\s*'DEMO'/.test(html)) {
  problems.push('CONFIG.url je nastavená na DEMO – aplikace by běžela s testovacími daty.');
}

if (problems.length) {
  console.error(`✖ ${FILE}`);
  problems.forEach((p) => console.error('  ' + p));
  process.exit(1);
}
console.log(`✔ ${FILE} je v pořádku.`);
