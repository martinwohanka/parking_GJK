# Parkoviště GJK — nasazení

Aplikace je jeden HTML soubor nad Supabase projektem Studovny. Všechny tabulky
mají prefix `park_`, takže se se Studovnou nikde nepotkají.

## 1. Databáze (5 minut)

1. Supabase → projekt Studovny → **SQL Editor** → New query.
2. Vložte celý obsah `schema.sql` a spusťte. Skript je idempotentní — můžete ho
   spustit i opakovaně, když budete něco měnit.
3. Zkontrolujte v **Table Editor**, že vzniklo pět tabulek: `park_settings`,
   `park_users`, `park_spots`, `park_reservations`, `park_penalties`,
   a že v `park_spots` je 10 míst.

Skript umí i upgrade už běžící databáze — chybějící sloupce si doplní sám.

## 2. Přihlašování a účty

Účty **zakládá výhradně správce** — nikdo se nezaregistruje sám a nikam se
neposílá žádný e-mail. Správce vytvoří účet, vygeneruje počáteční heslo
a předá ho kantorovi (ústně, lístečkem, přes školní chat). Při prvním
přihlášení si kantor musí nastavit vlastní heslo; do té doby se do aplikace
nedostane.

### 2.1 Nastavení v Supabase

**Authentication → Providers → Email**:

- *Enable Email provider* — **zapnuto**
- *Allow new users to sign up* (nebo *Enable sign-ups*) — **vypnuto**.
  Tohle je důležité: bez toho by se mohl zaregistrovat kdokoli, kdo zná
  adresu aplikace.
- *Confirm email* — na ničem nezáleží, účty zakládá správce rovnou jako
  potvrzené.

**Authentication → Policies** (nebo Providers → Email): minimální délka hesla
klidně nastavte na 8, aplikace i serverová funkce to stejně vyžadují.

E-mailové šablony ani SMTP řešit nemusíte — aplikace neposílá žádnou poštu.

### 2.2 Serverová funkce pro správu účtů

Zakládat účty umí jen Supabase Admin API se `service_role` klíčem, a ten se
nesmí dostat do prohlížeče. Proto je v projektu Edge Function `park-admin`:
ověří si, že ji volá přihlášený správce, a teprve pak účet založí, změní heslo
nebo smaže.

#### Varianta A: v prohlížeči (doporučeno, nic se neinstaluje)

1. Otevřete zdrojový kód funkce na GitHubu:
   [`supabase/functions/park-admin/index.ts`](https://github.com/martinwohanka/parking_GJK/blob/claude/parking-app-gymnasium-71p9ky/supabase/functions/park-admin/index.ts)
   a zkopírujte **celý** obsah (tlačítko *Copy raw file* vpravo nahoře).
2. V Supabase vyberte projekt → v levém menu **Edge Functions**.
3. **Deploy a new function** → **Via Editor**.
4. Jako název zadejte přesně `park-admin` — pod tímhle jménem ji aplikace volá.
5. Smažte ukázkový kód v editoru a vložte zkopírovaný obsah.
6. **Deploy function**. Do půl minuty je hotovo.

Pozor: dashboard neumí verzování. Když se kód funkce v budoucnu změní,
je potřeba ho vložit znovu (nebo použít variantu B).

#### Varianta B: z terminálu

Potřebuje Node.js. Ve složce projektu (tam, kde je podsložka `supabase`):

```bash
git pull                                            # ať máte funkci u sebe
npx supabase login                                  # otevře prohlížeč
npx supabase link --project-ref eizrqgpkfeixgqymorro
npx supabase functions deploy park-admin
```

`project-ref` je část adresy projektu před `.supabase.co`; najdete ji i
v Supabase pod **Settings → General → Reference ID**.

#### Ověření

Žádné tajné klíče nastavovat nemusíte — `SUPABASE_URL`,
`SUPABASE_ANON_KEY` a `SUPABASE_SERVICE_ROLE_KEY` doplní Supabase sám.

Že je funkce nasazená, poznáte podle toho, že se `park-admin` objeví
v seznamu v sekci **Edge Functions**. Nebo z terminálu:

```bash
curl -i -X OPTIONS https://<project-ref>.supabase.co/functions/v1/park-admin
```

Nasazená funkce odpoví `200`, chybějící `404` s hlavičkou
`sb-error-code: NOT_FOUND`.

**Bez nasazené funkce nepůjde zakládat účty.** Zbytek aplikace (rezervace,
kalendář, trestné body) funguje i bez ní. Aplikace v takovém případě
při zakládání účtu napíše, že funkce chybí.

### 2.3 První účet správce

Kruh se musí někde rozetnout — první admin vzniká ručně:

1. **Authentication → Users → Add user**. Zadejte svůj `@gjk.cz` e-mail,
   heslo a zaškrtněte *Auto Confirm User*.
2. V **SQL Editoru** spusťte:

   ```sql
   update park_users set role = 'admin' where email = 'vas.email@gjk.cz';
   ```

3. Přihlaste se do aplikace. Objeví se záložka **Správa** a aplikace vás
   vyzve k doplnění jména a SPZ.

Další správce už jen označíte ve Správě → Kantoři → Upravit → Role.

### 2.4 Jak správce zakládá kantory

**Správa → + Přidat kantora**. Vyplní se e-mail, jméno, SPZ, případně telefon
a role. Heslo se vygeneruje samo (vyslovitelné, bez znaků, co se pletou —
třeba `Curato-1997`), dá se i přepsat.

Po založení se nahoře v okně zobrazí panel s e-mailem a heslem — **opište si
je, po zavření okna se už nezobrazí.** Aplikace hesla nikde nezobrazuje ani
neukládá v čitelné podobě.

Zapomenuté heslo se řeší stejnou cestou: **Správa → Kantoři → Upravit →
Nastavit heslo**. Nové heslo se zobrazí jednou a kantor si ho po přihlášení
zase změní.

Ve stejném okně je i **Smazat účet** — smaže účet včetně všech jeho rezervací
a nedá se to vrátit.

### 2.5 Co dělá kantor

Přihlásí se e-mailem a heslem od správce. Aplikace ho hned vyzve k nastavení
vlastního hesla (minimálně 8 znaků) — dokud to neudělá, dál se nedostane.
Později si heslo může kdykoli změnit v **Profil → Heslo**.

Doména `@gjk.cz` se hlídá na třech místech: v aplikaci, v Edge Funkci
`park-admin` a v databázi (trigger `park_check_domain`). Účet s cizí adresou
nevznikne, ani kdyby někdo obcházel frontend.

## 3. Konfigurace aplikace

V `index.html` je hned nahoře ve `<script>` blok `CONFIG`:

```js
const CONFIG = {
  url:     'https://xxxxxxxx.supabase.co',   // Settings → API → Project URL
  anonKey: 'sb_publishable_…',               // Settings → API Keys → Publishable key
  emailDomain: 'gjk.cz',
  sendEmails: true,
};
```

Klíč najdete v **Settings → API Keys → Publishable key** (`sb_publishable_…`),
nebo rychleji přes tlačítko **Connect** v horní liště projektu. Starý `anon` klíč
je na záložce **Legacy API Keys** a pořád funguje, ale Supabase ho vyřazuje do
konce roku 2026 — u nové aplikace sáhněte rovnou po publishable.

Oba klíče jsou veřejné a patří do prohlížeče — bezpečnost stojí na RLS
politikách ze `schema.sql`, ne na utajení klíče. `service_role` / `sb_secret_…`
klíč do `index.html` nikdy nepatří.

Dokud tam zůstane `'DEMO'`, běží aplikace v ukázkovém režimu s testovacími daty
v prohlížeči — dá se proklikat bez databáze, hodí se na ukázku ve sborovně.
(V demu se přihlásíte jako `martin@gjk.cz` s libovolným heslem. Účty,
které v ukázce založíte, žijí do obnovení stránky.)

## 4. Nasazení

Nahrává se jediný soubor: `web/index.html` do kořene subdomény. Na iPhonu
i na Macu jde stránka přidat na plochu jako PWA.

### 4.1 Automaticky z GitHubu (doporučeno)

V repozitáři je připravený workflow `.github/workflows/deploy-ftp.yml`. Po
každé změně souboru `web/index.html` ho GitHub sám nahraje na FTP — nemusíte
nic přetahovat ručně a v historii je vidět, co se kdy změnilo.

Jednorázové nastavení v GitHubu, **Settings → Secrets and variables → Actions**:

| Záložka | Název | Hodnota |
| --- | --- | --- |
| Secrets | `FTP_SERVER` | adresa FTP serveru, např. `ftp.gjk.cz` |
| Secrets | `FTP_USERNAME` | přihlašovací jméno k FTP |
| Secrets | `FTP_PASSWORD` | heslo k FTP |
| Variables | `FTP_DIR` | cílová složka na serveru, např. `./www/parkoviste/` |

`FTP_DIR` musí odpovídat složce, kterou webhosting servíruje na zvolené
adrese. Když si nejste jistý, podívejte se do FTP klienta, kam se ukládá
stávající web — typicky `./www/`, `./public_html/` nebo `./web/`.

Před nahráním workflow spustí `scripts/kontrola.mjs`. Když by měl jít na web
rozbitý soubor, nahrání se neprovede.

Dokud `FTP_SERVER` chybí, workflow doběhne a nahrání jen přeskočí.

### 4.2 Ručně

Pořád je to jeden soubor — `web/index.html` nahrajte FTP klientem
(Cyberduck, FileZilla) do kořene subdomény. Nic jiného tam nepatří.

## 5. E-maily

Aplikace zatím neposílá žádné e-maily — ani potvrzení rezervací, ani nic
jiného. Rezervace kantor vidí v aplikaci v záložce **Rezervace**.

Až budete chtít potvrzovací e-maily přidat, znamená to jednu Edge Function
a vlastní SMTP (školní Forpsi: `smtp.forpsi.com`, port 587, uživatelské jméno
je celá adresa schránky). Řekněte si.

## 6. Fyzické označení míst

Aplikace počítá s deseti očíslovanými místy podle vašeho náčrtu — 1–7 v pravém
pruhu, 8–10 v levém u budovy. **Než to spustíte ostře, čísla musí být vidět
na parkovišti**, jinak rezervace nedávají smysl. Stačí nastřikované číslo na
asfalt nebo cedulka na zdi. V `park_spots` jde popisek i zóna kdykoli změnit
(a přes Správu se místo dá dočasně vyřadit — údržba, sníh, návštěva).

---

## Jak jsou nastavená pravidla

Všechno se dá měnit ve Správě, tohle jsou výchozí hodnoty:

| Nastavení | Výchozí | Co dělá |
|---|---|---|
| Týdenní limit | 3 dny | Kolik **dnů** v týdnu smí mít kantor rezervováno. Délka rezervace v rámci dne se nepočítá — kdo přijede na dvě hodiny, spálí stejnou „známku“ jako ten, kdo stojí celý den. |
| Provozní doba | 7–16 h | Rezervovatelné hodiny, po hodinových slotech. |
| Přes noc | povoleno | Sloupec „noc“ = 16:00 → 7:00 dalšího dne. |
| Dopředu | 21 dní | Jak daleko se dá rezervovat. |
| Body za den limitu | 5 | Každých 5 trestných bodů ubere jeden rezervovatelný den v týdnu. |
| Úplné zablokování | 20 bodů | Nad tuto hranici uživatel nemůže rezervovat vůbec. |

Limit se počítá od pondělí a jen za pracovní dny. Kontrola běží v databázi
(trigger `park_check_reservation`), ne v prohlížeči — obejít se nedá.

## Trestné body

Hlášení může podat kdokoli: zadá SPZ, závažnost a popis. Systém SPZ automaticky
spáruje s uživatelem podle jeho profilu. **Body se ale připíšou až po schválení
adminem** — jinak by šlo systém triviálně zneužít k vyřazení kolegy z rezervací.
Zamítnutá hlášení nemají žádný efekt.

Stojí za zvážení, jestli tuhle část zapnout hned. Sbor je malý a veřejné
bodování kolegů umí být citlivější věc než samotné parkování. Dá se začít bez
ní (hlášení prostě nikdo nebude podávat) a přidat ji, až se ukáže, že
domluva nestačí.

## Co aplikace záměrně neumí

- **Opakované rezervace** („každé úterý“). Kdo má pevný rozvrh, naklikat to na
  tři týdny dopředu je otázka půl minuty; automatika by v kombinaci s týdenním
  limitem dělala víc zmatku než užitku.
- **Čekací listinu.** Když se místo uvolní, prostě zezelená.
- **Fronty a priority.** Kdo dřív přijde. Pokud se ukáže, že si pár lidí bere
  místa hned po půlnoci, je snazší zkrátit okno rezervací (`max_days_ahead`)
  než stavět bodový systém priorit.
