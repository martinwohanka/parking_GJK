# Parkoviště GJK

Rezervační systém parkovacích míst u Gymnázia Jana Keplera pro pedagogické
pracovníky. Běží na mobilu i na počítači, instalovat není potřeba nic.

Celá aplikace je **jeden soubor** [`web/index.html`](web/index.html) nad
databází Supabase. Nasazuje se prostým nahráním na webhosting.

```
web/index.html                        aplikace (jediný soubor, který jde na web)
supabase/schema.sql                   databázové schéma a pravidla
supabase/functions/park-admin/        serverová funkce pro zakládání účtů
scripts/kontrola.mjs                  kontrola souboru před nasazením
NAVOD.md                              provozní návod – databáze, účty, pravidla
```

## Co aplikace umí

| | |
| --- | --- |
| Přístup | mobil i počítač, světlý i tmavý režim, na iPhonu lze přidat na plochu |
| Účty | zakládá výhradně správce, jen pro adresy `@gjk.cz`; kantor si při prvním přihlášení nastaví vlastní heslo |
| Plánek | rozmístění podle skutečného parkoviště – podélná stání 8–10 u budovy, kolmá 1–7 u zdi, vjezd i výjezd vlevo dole |
| Rezervace | kliknutím na místo se otevře týdenní kalendář po hodinách, označené sloty se potvrdí jedním tlačítkem |
| Přes noc | samostatný sloupec „noc“ (16:00 → 7:00 dalšího dne) |
| Limity | týdenní limit v počtu dnů, omezení, jak daleko dopředu lze rezervovat |
| Trestné body | hlášení špatného parkování na SPZ, body se připíšou až po schválení správcem |
| Správa | uživatelé, místa, rezervace i pravidla se mění přímo v aplikaci |

Podrobnosti k provozu, výchozím hodnotám a tomu, co aplikace záměrně neumí,
jsou v [NAVOD.md](NAVOD.md).

## Vyzkoušení bez databáze

V hlavičce souboru je blok `CONFIG`. Když se v něm `url` přepíše na `'DEMO'`,
běží aplikace s testovacími daty přímo v prohlížeči — nic se neukládá a nic
se nikam neposílá. Hodí se na ukázku ve sborovně.

```bash
# v kořeni projektu
python3 -m http.server 4000 --directory web
# a otevřít http://localhost:4000
```

V ukázkovém režimu se přihlásíte jako `martin@gjk.cz` s libovolným heslem.

> Otevřít `index.html` dvojklikem z Finderu nestačí — prohlížeč pak zablokuje
> načtení knihovny Supabase. Vždy přes lokální server, jako výše.

## Úpravy a nasazení

1. Upravte `web/index.html`.
2. Ověřte: `node scripts/kontrola.mjs` (ohlídá překlepy v JavaScriptu a to,
   že v souboru nezůstal ukázkový režim ani servisní klíč).
3. `git push` — GitHub soubor sám nahraje na FTP.

Nastavení automatického nahrávání popisuje [NAVOD.md](NAVOD.md#4-nasazení).

## Bezpečnost v kostce

- V souboru je `anon` (publishable) klíč Supabase. Ten **patří** do prohlížeče —
  aplikace ho posílá každému návštěvníkovi. Přístup k datům hlídají RLS
  politiky ze `supabase/schema.sql`, ne utajení klíče.
- `service_role` klíč do `index.html` nikdy nepatří; používá ho jen serverová
  funkce `park-admin`, kam ho doplní Supabase sám.
- V Supabase musí být vypnuté **Allow new users to sign up**. Bez toho by se
  mohl zaregistrovat kdokoli, kdo zná adresu aplikace.
