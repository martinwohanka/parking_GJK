# Nasazení na internet (Vercel + Neon)

Návod pro úplné začátečníky. Celé to zabere zhruba půl hodiny a nic
z toho nestojí peníze – bezplatné tarify obou služeb na parkoviště pro
třicet kantorů bohatě stačí.

Co kde běží:

| Služba | K čemu slouží | Cena |
| --- | --- | --- |
| **Neon** | databáze (uživatelé, rezervace, trestné body) | zdarma |
| **Vercel** | samotná aplikace, HTTPS, adresa na internetu | zdarma |
| GitHub | úložiště kódu, odsud se nasazuje | zdarma |

---

## 1. Databáze na Neonu

1. Otevřete <https://neon.tech> a zaregistrujte se (nejrychleji tlačítkem
   *Continue with GitHub*).
2. **Create project**:
   - *Project name*: `parkoviste-gjk`
   - *Region*: vyberte evropský (např. *Europe (Frankfurt)*) – data zůstanou
     v EU a aplikace bude svižnější.
3. Po vytvoření se zobrazí **connection string**. Neon nabízí dvě varianty,
   budete potřebovat obě:
   - **Pooled connection** (v adrese je `-pooler`) → pro Vercel,
   - **Direct connection** (bez `-pooler`) → pro vytvoření tabulek z vašeho Macu.

   Zkopírujte si obě někam stranou. Vypadají takto:
   `postgresql://jmeno:heslo@ep-neco-123.eu-central-1.aws.neon.tech/neondb?sslmode=require`

> Connection string obsahuje heslo k databázi. Nikam ho neposílejte a
> nevkládejte do souborů, které se nahrávají na GitHub.

## 2. Vytvoření tabulek a účtu správce

Tohle se dělá jednou, z vašeho počítače, ve složce projektu:

1. Otevřete soubor `.env` a na řádek `DATABASE_URL` vložte **direct**
   connection string z Neonu:
   ```
   DATABASE_URL="postgresql://…neon.tech/neondb?sslmode=require"
   ```
2. Nastavte si rovnou heslo správce (ať nemusíte měnit výchozí):
   ```
   ADMIN_EMAIL="vase.jmeno@gjk.cz"
   ADMIN_PASSWORD="zvolte-silne-heslo"
   ```
3. Spusťte:
   ```bash
   npm run setup
   ```
   Vytvoří to v Neonu tabulky, deset parkovacích míst a účet správce.
4. Ověřte, že to funguje: `npm run dev` a přihlaste se. Data teď jsou
   v cloudové databázi, ne u vás na disku.

## 3. Nasazení aplikace na Vercel

1. Otevřete <https://vercel.com> a zaregistrujte se tlačítkem
   *Continue with GitHub*.
2. **Add New… → Project** a v seznamu najděte repozitář
   `martinwohanka/parking_GJK` → *Import*.
3. Vercel sám pozná, že jde o Next.js – nastavení buildu neměňte.
4. Rozbalte **Environment Variables** a vyplňte:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | **pooled** connection string z Neonu (ten s `-pooler`) |
   | `SESSION_SECRET` | nový náhodný řetězec, viz níže |
   | `ALLOWED_EMAIL_DOMAIN` | `gjk.cz` |

   Nový `SESSION_SECRET` vygenerujete na svém počítači příkazem:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
   ```
   Použijte **jiný** než máte lokálně v `.env`.

5. **Deploy**. Za dvě až tři minuty dostanete adresu typu
   `https://parking-gjk.vercel.app` – aplikace je od té chvíle na internetu.

## 4. Dokončení

1. Přidejte ještě jednu proměnnou: *Settings → Environment Variables* →
   `APP_URL` = adresa, kterou vám Vercel přidělil (i s `https://`).
   Používá se v odkazech v e-mailech. Pak *Deployments → … → Redeploy*.
2. Otevřete aplikaci, přihlaste se jako správce a projděte
   *Správa → Nastavení* – zkontrolujte provozní dobu a týdenní příděl.
3. Pošlete kantorům odkaz. Registrují se sami, stačí jim školní e-mail
   `@gjk.cz` a SPZ.

## 5. Vlastní adresa (nepovinné)

Chcete-li `parkoviste.gjk.cz` místo `…vercel.app`:

1. Ve Vercelu *Settings → Domains* → přidejte `parkoviste.gjk.cz`.
2. Vercel vypíše jeden DNS záznam (CNAME). Předejte ho správci školních
   domén, ať ho přidá.
3. Po propsání DNS (obvykle do hodiny) upravte `APP_URL` na novou adresu
   a znovu nasaďte.

---

## Provoz

**Změny v aplikaci** – po každém `git push` do větve
`claude/parking-app-gymnasium-71p9ky` se nová verze nasadí sama.

**Změna datového modelu** – pokud přibude tabulka nebo sloupec, je potřeba
z počítače jednou spustit `npx prisma db push` s **direct** connection
stringem v `.env`. Vercel sám databázi nemění.

**Zálohy** – Neon drží historii změn a umí obnovit stav k danému okamžiku
(*Restore* v konzoli). U bezplatného tarifu je okno kratší, u parkoviště to
ale bohatě stačí.

**E-maily** – zatím nejsou nastavené, takže potvrzení o rezervaci nikomu
nechodí; aplikace to nikde netvrdí. Až budete chtít, přidejte do proměnných
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` a `MAIL_FROM`
(údaje dá správce školní pošty) a znovu nasaďte. Nic v kódu se měnit nemusí.

**Limity bezplatných tarifů** – Neon uspává databázi při nečinnosti, takže
první načtení po delší pauze může trvat o vteřinu déle. Bezplatný tarif
Vercelu (*Hobby*) je určen pro nekomerční použití; školní interní nástroj
tomu odpovídá, ale pokud by měl Vercel námitky, řešením je tarif *Pro*
(20 USD měsíčně) nebo přesun na Railway či školní server.

## Než pozvete kantory

- [ ] Změněné heslo správce (ne výchozí `Parkoviste123`).
- [ ] `SESSION_SECRET` na Vercelu je jiný než ten lokální.
- [ ] `APP_URL` odpovídá skutečné adrese.
- [ ] V *Správa → Nastavení* sedí provozní doba, týdenní příděl a pravidla
      trestných bodů.
- [ ] V *Správa → Parkovací místa* souhlasí čísla míst se skutečností
      a jsou vyznačená i na parkovišti.
