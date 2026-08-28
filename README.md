# Parkoviště GJK – rezervační systém

Webová aplikace pro rezervaci parkovacích míst u Gymnázia Jana Keplera. Funguje
na mobilu i na počítači (responzivní rozhraní, žádná instalace). Kantoři si
rezervují konkrétní časové sloty na konkrétním místě, správce rezervace edituje
a řeší trestné body za špatné parkování.

**Nasazení na internet:** postup krok za krokem najdete v [NASAZENI.md](NASAZENI.md).

## Co aplikace umí

| Požadavek | Řešení |
| --- | --- |
| Přístup na mobilu i PC | Responzivní web (Next.js), stačí prohlížeč |
| Registrace kantora včetně SPZ | `/registrace`, SPZ povinná, další vozidla lze přidat v profilu |
| Registrace jen pro školní e-maily | Kontrola domény `@gjk.cz` (`ALLOWED_EMAIL_DOMAIN`), potvrzovací odkaz se nevyžaduje |
| Ochrana proti hádání hesel | Po 10 neúspěšných pokusech se e-mail na 15 minut uzamkne |
| Kalendář všedních dní × hodin 7–16 | Detail místa: řádky = dny, kostičky = hodinové sloty, zelená/červená |
| U obsazených slotů jméno registrátora | Jméno je přímo v červené kostičce i v tooltipu |
| Rezervace označením slotů + potvrzení | Kliknutím sloty zčervenají, tlačítko „Potvrdit rezervaci“ |
| Časový úsek / celý den / přes noc | Volné sloty, tlačítko „celý den“, sloupec „přes noc“ (16:00–7:00) |
| Potvrzující e-mail | Odesílá se po vytvoření, změně i zrušení rezervace |
| Admin edituje/ruší rezervace | `/admin/rezervace` – změna místa, dne i času; kantor dostane e-mail |
| Vstupní kritéria (tokeny) | Týdenní příděl rezervací, limit na den, limit dní dopředu |
| Trestné body za špatné parkování | Kdokoli nahlásí SPZ, správce schválí, body snižují příděl až po blokaci |
| Zmapování parkovacích míst | 10 míst podle plánku; v `/admin/mista` lze měnit označení, sekci, pořadí i dostupnost |

## Plánek parkoviště

Výchozí data odpovídají náčrtu: sekce **u vstupu do budovy** (místa 8, 9, 10,
dole výjezd) a sekce **podél zdi** (místa 1–7). Všech 10 míst je k dispozici
a odpovídá skutečnému stavu parkoviště. Místa lze kdykoli přejmenovat, přidat,
deaktivovat (např. při opravě povrchu) nebo přeuspořádat v administraci.

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

## Spuštění na vlastním počítači (krok za krokem)

Potřebujete **Node.js verze 22 nebo novější** – stáhnete na
<https://nodejs.org> (varianta LTS). Ověřte v terminálu příkazem `node -v`.
Repozitář je veřejný, takže ke stažení není potřeba se nikam přihlašovat.

Dále potřebujete **databázi PostgreSQL**. Nejrychleji ji získáte zdarma
na <https://neon.tech> (registrace přes GitHub, do dvou minut máte
připojovací řetězec). Pro vývoj si klidně založte druhý projekt, ať si
nemícháte zkušební data s ostrým provozem.

Příkazy zadávejte **po jednom** a počkejte, až každý doběhne:

```bash
# 1. stáhnout projekt do domovské složky
git clone https://github.com/martinwohanka/parking_GJK

# 2. vstoupit do složky projektu – bez tohoto kroku npm nic nenajde
cd parking_GJK

# 3. nainstalovat závislosti (chvíli to trvá)
npm install

# 4. připravit konfiguraci (vytvoří .env)
npm run setup
```

Napoprvé skončí `npm run setup` hláškou, že v `.env` chybí `DATABASE_URL`.
Vložte tam připojovací řetězec z Neonu a spusťte příkaz znovu – pak už
založí tabulky i výchozí data:

```bash
# 5. znovu, už s vyplněnou databází
npm run setup

# 6. spustit
npm run dev
```

Všechny příkazy od kroku 3 dál musí běžet **uvnitř složky `parking_GJK`**.
Poznáte to podle výzvy terminálu, která končí `parking_GJK %`. Když uvidíte
chybu `Could not read package.json`, stojíte mimo složku – napište `cd
parking_GJK` a zkuste to znovu. Kam jste se dostali, zjistíte příkazem `pwd`.

`npm run setup` sám vytvoří soubor `.env` z předlohy, vygeneruje do něj tajný
klíč `SESSION_SECRET` a založí databázi s 10 parkovacími místy a účtem správce.
Nic ručně vyplňovat nemusíte. Příkaz lze pustit opakovaně – vlastní hodnoty
v `.env` nepřepisuje.

Aplikace běží na <http://localhost:3000>. Přihlaste se jako
`admin@gjk.cz` / `Parkoviste123` a **hned si změňte heslo** (viz níže).

Zastavíte ji v terminálu klávesami `Ctrl+C`. Příště už stačí `npm run dev`.

### Když něco nefunguje

**`npm error … Could not read package.json`**
Nejste ve složce projektu. Napište `cd parking_GJK` a příkaz zopakujte;
`pwd` vypíše, kde právě jste.

**`Environment variable not found: DATABASE_URL` (kód P1012)**
Chybí soubor `.env`. Stáhněte si nejnovější verzi projektu příkazem `git pull`
a spusťte `npm run setup` znovu – ten `.env` sám vytvoří.

**„Databáze není připravená“ v prohlížeči**
Neproběhl krok `npm run setup`, nebo skončil chybou. Zastavte aplikaci
klávesami `Ctrl+C`, spusťte `npm run setup` a pak znovu `npm run dev`.
Restart je nutný i tehdy, když jste setup spustili až po startu aplikace –
běžící server se drží původního, prázdného souboru databáze.

**`Warning: Next.js inferred your workspace root`**
Ve složce nad projektem (typicky v domovské) zůstal soubor `package-lock.json`
z nepovedeného `npm install`. Novější verze projektu už si kořen určuje sama,
takže stačí `git pull`; zbylý soubor můžete smazat příkazem
`rm ~/package-lock.json`.

**„Něco se pokazilo“ s jinou hláškou**
Rozbalte *Podrobnosti pro vývojáře* na chybové stránce, nebo se podívejte do
terminálu, kde běží `npm run dev` – tam je vypsaná celá chyba i s odkazem na
řádek v kódu.

**Port 3000 je obsazený**
Aplikace si sama vezme další volný port a vypíše ho v terminálu. Vlastní port
zvolíte příkazem `PORT=3001 npm run dev`.

**Po `git pull` aplikace hlásí chybu o chybějící tabulce**
Změnil se datový model. Zastavte aplikaci (`Ctrl+C`), spusťte `npm run setup`
a pak znovu `npm run dev` – běžící server si drží starou podobu databáze.

**„Příliš mnoho neúspěšných pokusů“ při přihlášení**
Ochrana proti hádání hesel: po 10 chybných pokusech se e-mail na 15 minut
uzamkne. Buď počkejte, nebo správce nastaví nové heslo v *Správa → Uživatelé*.

**Chci začít úplně načisto**
`npm run db:reset` smaže databázi a znovu ji naplní výchozími daty
(10 míst a účet správce). Přijdete tím o všechny rezervace i registrace.

### Úpravy souboru `.env`

`.env` je obyčejný textový soubor v kořeni projektu, řádek po řádku ve tvaru
`NAZEV="hodnota"`. Otevřete ho v libovolném editoru (VS Code, Poznámkový blok,
TextEdit) a upravenou hodnotu jen přepište mezi uvozovkami. Změny se projeví
po restartu aplikace (`Ctrl+C` a znovu `npm run dev`).

Soubor začíná tečkou, takže je ve Finderu i v Průzkumníku skrytý – v macOS ho
zobrazíte zkratkou `Cmd+Shift+.`, ve Windows zaškrtnutím *Zobrazit → Skryté
položky*. Nejjednodušší je otevřít celou složku projektu ve VS Code, kde je
vidět běžně.

Do gitu se `.env` nikdy nenahrává (je v `.gitignore`), takže do něj patří
i hesla k SMTP nebo databázi.

### Tajný klíč `SESSION_SECRET`

Slouží k podepisování přihlašovacích cookies – kdo ho zná, umí se vydávat za
kohokoli, takže ho nikdy nesdílejte. Doplní se sám při `npm run setup`;
vygenerovat nový můžete kdykoli příkazem:

```bash
npm run env:secret
```

Chcete-li vlastní hodnotu, přepište v `.env` řádek
`SESSION_SECRET="…"` – stačí libovolný náhodný řetězec delší než 16 znaků.
V produkci aplikace bez klíče vůbec nenastartuje. Změna klíče odhlásí všechny
přihlášené uživatele, nic jiného se nestane.

### Heslo správce

Výchozí správce vzniká při `npm run setup` z proměnných `ADMIN_EMAIL` /
`ADMIN_PASSWORD` v `.env` (výchozí `admin@gjk.cz` / `Parkoviste123`).
Heslo změníte kterýmkoli z těchto způsobů:

1. **Ještě před prvním spuštěním** – v `.env` přepište `ADMIN_PASSWORD`
   (a případně `ADMIN_EMAIL`) a teprve pak spusťte `npm run setup`.
2. **V aplikaci** (doporučeno) – přihlaste se a v *Můj profil → Změna hesla*
   zadejte současné a dvakrát nové heslo.
3. **Jinému uživateli** – v *Správa → Uživatelé* otevřete u kantora **Detail**
   a v poli *Nastavit heslo* zadejte nové. Heslo mu předejte bezpečnou cestou,
   ať si ho sám změní.

Pozor: úprava `ADMIN_PASSWORD` v `.env` **po** seedu už na existující účet
nemá vliv – heslo je v databázi. První uživatel, který se zaregistruje do
prázdné databáze, dostane roli správce automaticky.

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

Podrobný návod pro Vercel + Neon je v [NASAZENI.md](NASAZENI.md). Ve zkratce
platí pro jakýkoli hosting:

1. `DATABASE_URL` míří na produkční PostgreSQL.
2. `SESSION_SECRET` je jiný než vývojový, `APP_URL` odpovídá veřejné adrese.
3. Tabulky se založí příkazem `npx prisma db push`, výchozí data `npm run db:seed`.
4. Build a start: `npm ci && npm run build && npm start`.
5. Aplikace musí běžet přes HTTPS – přihlašovací cookie se v produkci posílá
   pouze zabezpečeně.

## Testy a kontroly

```bash
npm run typecheck   # TypeScript
npm test            # 33 testů business logiky nad testovací databází
npm run build       # produkční build
```

Testy pokrývají práci s časem a přelomy dnů, normalizaci SPZ, slučování slotů,
překryvy rezervací (včetně nočních přes půlnoc), limity na den, týdenní tokeny,
trestné body, omezení pokusů o přihlášení a vykreslení mřížky.

Testy potřebují vlastní databázi, aby nesmazaly vývojová data. Adresu jim
předáte proměnnou `TEST_DATABASE_URL`; bez ní míří na
`postgresql://postgres@127.0.0.1:5432/parkoviste_test`.

## Struktura projektu

```
prisma/schema.prisma      datový model (uživatel, SPZ, místo, rezervace, body, nastavení)
NASAZENI.md               návod na vystavení aplikace na internet
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

- **Přihlášení přes školní Google/Microsoft účet** místo vlastního hesla.
- **Fotodokumentace u nahlášení** špatného parkování (nahrání fotky).
- **Opakované rezervace** (např. každé úterý po celé pololetí).
- **Čekací listina** na obsazený slot s upozorněním při uvolnění.
