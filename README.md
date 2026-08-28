# Parkoviště GJK – rezervační systém

Webová aplikace pro rezervaci parkovacích míst u Gymnázia Jana Keplera. Funguje
na mobilu i na počítači (responzivní rozhraní, žádná instalace). Kantoři si
rezervují konkrétní časové sloty na konkrétním místě, správce rezervace edituje
a řeší trestné body za špatné parkování.

## Co aplikace umí

| Požadavek | Řešení |
| --- | --- |
| Přístup na mobilu i PC | Responzivní web (Next.js), stačí prohlížeč |
| Registrace kantora včetně SPZ | `/registrace`, SPZ povinná, další vozidla lze přidat v profilu |
| Registrace jen pro školní e-maily | Kontrola domény `@gjk.cz` (`ALLOWED_EMAIL_DOMAIN`) |
| Kalendář všedních dní × hodin 7–16 | Detail místa: řádky = dny, kostičky = hodinové sloty, zelená/červená |
| U obsazených slotů jméno registrátora | Jméno je přímo v červené kostičce i v tooltipu |
| Rezervace označením slotů + potvrzení | Kliknutím sloty zčervenají, tlačítko „Potvrdit rezervaci“ |
| Časový úsek / celý den / přes noc | Volné sloty, tlačítko „celý den“, sloupec „přes noc“ (16:00–7:00) |
| Potvrzující e-mail | Odesílá se po vytvoření, změně i zrušení rezervace |
| Admin edituje/ruší rezervace | `/admin/rezervace` – změna místa, dne i času; kantor dostane e-mail |
| Vstupní kritéria (tokeny) | Týdenní příděl rezervací, limit na den, limit dní dopředu |
| Trestné body za špatné parkování | Kdokoli nahlásí SPZ, správce schválí, body snižují příděl až po blokaci |
| Zmapování parkovacích míst | `/admin/mista` – označení, sekce a pořadí odpovídající plánku |

## Plánek parkoviště

Výchozí data odpovídají náčrtu: sekce **u vstupu do budovy** (místa 8, 9, 10,
dole výjezd) a sekce **podél zdi** (místa 1–7). Místo č. 1 je na náčrtu
vyšrafované – je založené s poznámkou, aby se před ostrým provozem ověřilo
v terénu. Místa lze kdykoli přejmenovat, přidat, deaktivovat nebo přeuspořádat
v administraci; **doporučujeme čísla fyzicky vyznačit i na parkovišti**, aby
odpovídala aplikaci.

## Jak funguje rezervace

1. Kantor se přihlásí a na hlavní stránce vidí plánek s obsazeností za zbývající
   část týdne (zelená / oranžová / červená).
2. Kliknutím na místo se otevře týdenní kalendář: řádky = všední dny, sloupce =
   hodinové sloty provozní doby (výchozí 7:00–16:00) plus volitelný sloupec
   „přes noc“.
3. Označením volných slotů zčervenají a objeví se v souhrnu. Navazující sloty
   jednoho dne se sloučí do **jedné** rezervace.
4. Po kliknutí na „Potvrdit rezervaci“ se rezervace uloží a na školní e-mail
   dorazí potvrzení.

### Tokeny (vstupní kritéria)

Jedna souvislá rezervace = **jeden token**. Každý kantor má týdenní příděl
(výchozí 5 na kalendářní týden). Příděl mění správce globálně
(`/admin/nastaveni`) nebo individuálně u konkrétního kantora
(`/admin/uzivatele`, bonus/malus). Rezervace založená správcem tokeny nečerpá.

### Trestné body

Kterýkoli přihlášený kantor nahlásí SPZ špatně zaparkovaného vozidla
(`/prestupky`). Nahlášení je nejprve „ke schválení“ – body se připíšou teprve
po potvrzení správcem, takže systém nelze zneužít. Body jsou navázané na SPZ,
a tím na jejího majitele v databázi.

- za každých `pointsPerTokenLoss` bodů (výchozí 3) se týdenní příděl sníží o 1,
- při `blockAtPoints` bodech (výchozí 10) se rezervace zcela zablokují,
- body vyprší po `penaltyDecayDays` dnech (výchozí 180).

## Spuštění lokálně

```bash
npm install
cp .env.example .env      # vyplňte SESSION_SECRET a případně SMTP
npm run setup             # prisma generate + db push + seed (10 míst, admin)
npm run dev               # http://localhost:3000
```

Výchozí správce vzniká při seedu z proměnných `ADMIN_EMAIL` / `ADMIN_PASSWORD`
(výchozí `admin@gjk.cz` / `Parkoviste123`) – **heslo po prvním přihlášení
změňte**. První uživatel, který se zaregistruje do prázdné databáze, dostane
roli správce automaticky.

## Konfigurace (`.env`)

| Proměnná | Význam |
| --- | --- |
| `DATABASE_URL` | Připojení k databázi (SQLite soubor nebo PostgreSQL) |
| `SESSION_SECRET` | Klíč pro podepisování přihlašovacích cookies (min. 32 znaků) |
| `APP_URL` | Veřejná adresa aplikace, používá se v e-mailech |
| `ALLOWED_EMAIL_DOMAIN` | Povolená doména pro registraci (výchozí `gjk.cz`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | Odesílání e-mailů |
| `MAIL_FROM` | Odesílatel zpráv |

Bez vyplněného `SMTP_HOST` se e-maily neodesílají, ale vypisují do konzole a
ukládají do složky `mail-outbox/` – vhodné pro vývoj a testování.

## Nasazení do produkce

1. V `prisma/schema.prisma` přepněte `provider` na `"postgresql"` a nastavte
   `DATABASE_URL` na produkční databázi (SQLite se pro víc současných uživatelů
   nehodí).
2. Nastavte `SESSION_SECRET` (`openssl rand -base64 48`), `APP_URL` a SMTP.
3. `npm ci && npx prisma migrate deploy && npm run build && npm start`
   (při prvním nasazení `npx prisma db push` a `npm run db:seed`).
4. Aplikace musí běžet přes HTTPS – přihlašovací cookie se v produkci posílá
   pouze zabezpečeně.

## Testy a kontroly

```bash
npm run typecheck   # TypeScript
npm test            # 29 testů business logiky nad dočasnou SQLite databází
npm run build       # produkční build
```

Testy pokrývají práci s časem a přelomy dnů, normalizaci SPZ, slučování slotů,
překryvy rezervací (včetně nočních přes půlnoc), limity na den, týdenní tokeny,
trestné body a vykreslení mřížky.

## Struktura projektu

```
prisma/schema.prisma      datový model (uživatel, SPZ, místo, rezervace, body, nastavení)
prisma/seed.ts            výchozí data – 10 míst podle plánku + účet správce
src/lib/time.ts           datum/čas, sloty, kalendářní týdny (bez závislosti na časové zóně)
src/lib/reservations.ts   kalendářní mřížka, validace a vytváření rezervací
src/lib/tokens.ts         týdenní příděl, trestné body, blokace
src/lib/mail.ts           odesílání a šablony e-mailů
src/lib/auth.ts           přihlášení, hashování hesel (scrypt), podepsaná cookie
src/app/                  stránky (kantor) a /admin (správce)
src/components/           plánek, kalendářní mřížka, sdílené prvky UI
tests/logic.test.ts       testy business logiky
```

## Poznámky k dalšímu rozvoji

- **Ověření e-mailu při registraci** – nyní stačí adresa ve školní doméně;
  potvrzovací odkaz by přidal jistotu, že adresa opravdu patří registrujícímu.
- **Přihlášení přes školní Google/Microsoft účet** místo vlastního hesla.
- **Fotodokumentace u nahlášení** špatného parkování (nahrání fotky).
- **Opakované rezervace** (např. každé úterý po celé pololetí).
- **Čekací listina** na obsazený slot s upozorněním při uvolnění.
