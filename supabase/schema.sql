-- =====================================================================
--  PARKOVIŠTĚ GJK — databázové schéma pro Supabase (PostgreSQL)
--  Spusťte celý soubor v SQL Editoru nového Supabase projektu.
--  Skript je idempotentní — lze spustit opakovaně.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- 1) NASTAVENÍ APLIKACE (upravitelné adminem v UI)
-- ---------------------------------------------------------------------
create table if not exists park_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

insert into park_settings (key, value) values
  ('weekly_day_limit',        '3'::jsonb),      -- kolik dní v týdnu smí mít kantor rezervováno
  ('day_start_hour',          '7'::jsonb),      -- začátek rezervovatelného dne
  ('day_end_hour',            '16'::jsonb),     -- konec rezervovatelného dne
  ('allow_overnight',         'true'::jsonb),   -- povolit rezervaci přes noc (do day_start dalšího dne)
  ('penalty_points_per_slot', '5'::jsonb),      -- kolik trestných bodů ubere jeden den z týdenního limitu
  ('penalty_block_threshold', '20'::jsonb),     -- od kolika bodů je uživatel zablokován úplně
  ('max_days_ahead',          '21'::jsonb),     -- jak daleko dopředu lze rezervovat
  ('email_from',              '"Parkoviště GJK <parkoviste@gjk.cz>"'::jsonb)
on conflict (key) do nothing;

create or replace function park_setting_int(p_key text, p_default int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from park_settings where key = p_key), p_default);
$$;

create or replace function park_setting_bool(p_key text, p_default boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from park_settings where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------
-- 2) UŽIVATELÉ (profil navázaný na auth.users)
-- ---------------------------------------------------------------------
create table if not exists park_users (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null unique,
  full_name      text not null default '',
  phone          text default '',
  plates         text[] not null default '{}',    -- SPZ, vždy velkými písmeny bez mezer
  role           text not null default 'teacher' check (role in ('teacher','admin')),
  is_active      boolean not null default true,
  penalty_points int not null default 0,
  must_change_password boolean not null default false,
  created_at     timestamptz not null default now()
);

-- pro upgrade už běžící databáze
alter table park_users add column if not exists must_change_password boolean not null default false;

create index if not exists park_users_plates_idx on park_users using gin (plates);

-- Registrace pouze pro školní doménu -----------------------------------
create or replace function park_check_domain()
returns trigger language plpgsql as $$
begin
  if lower(new.email) not like '%@gjk.cz' then
    raise exception 'Registrace je povolena pouze pro e-maily v doméně @gjk.cz';
  end if;
  new.email := lower(new.email);
  return new;
end $$;

drop trigger if exists park_users_domain on park_users;
create trigger park_users_domain
  before insert or update of email on park_users
  for each row execute function park_check_domain();

-- Pojistka: kdyby profil nevznikl přes Edge Funkci park-admin ----------
create or replace function park_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) like '%@gjk.cz' then
    insert into park_users (id, email, full_name)
    values (new.id, lower(new.email), coalesce(new.raw_user_meta_data->>'full_name', ''))
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists park_on_auth_user_created on auth.users;
create trigger park_on_auth_user_created
  after insert on auth.users
  for each row execute function park_handle_new_user();

-- Pomocná funkce: je přihlášený uživatel admin? ------------------------
create or replace function park_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from park_users where id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------------
-- 3) PARKOVACÍ MÍSTA
-- ---------------------------------------------------------------------
create table if not exists park_spots (
  id          int primary key,
  label       text not null,
  note        text default '',
  zone        text default '',                  -- např. 'u zdi' / 'u vjezdu'
  is_blocked  boolean not null default false,   -- údržba, sníh, návštěva
  block_note  text default '',
  sort_order  int not null default 0
);

insert into park_spots (id, label, zone, sort_order) values
  (1,'1','pravý pruh',1),  (2,'2','pravý pruh',2),  (3,'3','pravý pruh',3),
  (4,'4','pravý pruh',4),  (5,'5','pravý pruh',5),  (6,'6','pravý pruh',6),
  (7,'7','pravý pruh',7),  (8,'8','levý pruh',8),   (9,'9','levý pruh',9),
  (10,'10','levý pruh',10)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 4) REZERVACE
--    Rezervace je časový interval [od, do) navázaný na místo.
--    EXCLUDE constraint garantuje, že se dvě rezervace na jednom místě
--    nikdy nepřekryjí — ani přes půlnoc.
-- ---------------------------------------------------------------------
create table if not exists park_reservations (
  id          uuid primary key default gen_random_uuid(),
  spot_id     int  not null references park_spots(id) on delete cascade,
  user_id     uuid not null references park_users(id) on delete cascade,
  period      tstzrange not null,
  is_overnight boolean not null default false,
  note        text default '',
  created_at  timestamptz not null default now(),
  created_by  uuid references park_users(id),
  constraint park_reservations_no_overlap
    exclude using gist (spot_id with =, period with &&)
);

create index if not exists park_reservations_period_idx on park_reservations using gist (period);
create index if not exists park_reservations_user_idx   on park_reservations (user_id);

-- Kontrola pravidel při vkládání ---------------------------------------
create or replace function park_check_reservation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_admin    boolean := park_is_admin();
  v_user        park_users%rowtype;
  v_limit       int := park_setting_int('weekly_day_limit', 3);
  v_per_slot    int := park_setting_int('penalty_points_per_slot', 5);
  v_block_at    int := park_setting_int('penalty_block_threshold', 20);
  v_max_ahead   int := park_setting_int('max_days_ahead', 21);
  v_start       timestamptz := lower(new.period);
  v_end         timestamptz := upper(new.period);
  v_days_used   int;
  v_week_start  date;
  v_effective   int;
  v_spot        park_spots%rowtype;
begin
  if v_start is null or v_end is null or v_end <= v_start then
    raise exception 'Neplatný časový rozsah rezervace.';
  end if;

  new.created_by := coalesce(auth.uid(), new.user_id);

  select * into v_spot from park_spots where id = new.spot_id;
  if v_spot.id is null then
    raise exception 'Parkovací místo neexistuje.';
  end if;
  if v_spot.is_blocked and not v_is_admin then
    raise exception 'Místo % je dočasně zablokované (%).', v_spot.label, coalesce(nullif(v_spot.block_note,''),'bez uvedení důvodu');
  end if;

  select * into v_user from park_users where id = new.user_id;
  if v_user.id is null then
    raise exception 'Uživatel neexistuje.';
  end if;

  -- Admin (a servisní přístup mimo aplikaci) může ostatní pravidla obejít
  if v_is_admin or auth.uid() is null then
    return new;
  end if;

  if new.user_id <> auth.uid() then
    raise exception 'Rezervaci lze vytvořit pouze sám za sebe.';
  end if;

  if not v_user.is_active then
    raise exception 'Váš účet je deaktivovaný, obraťte se na správce.';
  end if;

  if array_length(v_user.plates, 1) is null then
    raise exception 'Před rezervací si prosím doplňte SPZ ve svém profilu.';
  end if;

  if v_user.penalty_points >= v_block_at then
    raise exception 'Máte % trestných bodů — rezervace jsou pozastaveny (limit %).', v_user.penalty_points, v_block_at;
  end if;

  if v_start < now() - interval '1 hour' then
    raise exception 'Nelze rezervovat čas v minulosti.';
  end if;

  if v_start > now() + (v_max_ahead || ' days')::interval then
    raise exception 'Rezervovat lze nejvýše % dní dopředu.', v_max_ahead;
  end if;

  if extract(isodow from (v_start at time zone 'Europe/Prague')) > 5 then
    raise exception 'Rezervace jsou možné pouze v pracovní dny.';
  end if;

  if new.is_overnight and not park_setting_bool('allow_overnight', true) then
    raise exception 'Rezervace přes noc nejsou povoleny.';
  end if;

  -- Týdenní limit v počtu odlišných dní (pondělí = začátek týdne)
  v_week_start := date_trunc('week', v_start at time zone 'Europe/Prague')::date;

  select count(distinct (lower(period) at time zone 'Europe/Prague')::date)
    into v_days_used
    from park_reservations
   where user_id = new.user_id
     and (lower(period) at time zone 'Europe/Prague')::date
         between v_week_start and v_week_start + 4
     and (lower(period) at time zone 'Europe/Prague')::date
         <> (v_start at time zone 'Europe/Prague')::date;

  v_effective := greatest(v_limit - (v_user.penalty_points / nullif(v_per_slot,0)), 0);

  if v_days_used + 1 > v_effective then
    raise exception 'Vyčerpali jste týdenní limit % rezervovaných dnů (využito %).', v_effective, v_days_used;
  end if;

  return new;
end $$;

drop trigger if exists park_reservations_check on park_reservations;
create trigger park_reservations_check
  before insert or update on park_reservations
  for each row execute function park_check_reservation();

-- ---------------------------------------------------------------------
-- 5) TRESTNÉ BODY ZA ŠPATNÉ PARKOVÁNÍ
--    Hlášení podává kdokoli na SPZ. Body se připisují až po schválení
--    adminem — bez toho by šlo systém snadno zneužít.
-- ---------------------------------------------------------------------
create table if not exists park_penalties (
  id           uuid primary key default gen_random_uuid(),
  plate        text not null,
  target_user  uuid references park_users(id) on delete set null,
  reported_by  uuid not null references park_users(id) on delete cascade,
  reason       text not null default '',
  photo_url    text default '',
  points       int not null default 5,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  occurred_at  timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references park_users(id),
  admin_note   text default ''
);

create index if not exists park_penalties_status_idx on park_penalties (status);

-- Normalizace SPZ + automatické spárování s uživatelem ------------------
create or replace function park_penalty_prepare()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.plate := upper(regexp_replace(coalesce(new.plate,''), '[^A-Za-z0-9]', '', 'g'));
  if new.plate = '' then
    raise exception 'Zadejte prosím SPZ.';
  end if;
  select id into new.target_user from park_users where new.plate = any (plates) limit 1;
  return new;
end $$;

drop trigger if exists park_penalties_prepare on park_penalties;
create trigger park_penalties_prepare
  before insert on park_penalties
  for each row execute function park_penalty_prepare();

-- Přepočet bodů uživatele po schválení / zamítnutí ----------------------
create or replace function park_penalty_apply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.target_user is not null then
    update park_users u
       set penalty_points = coalesce((
             select sum(p.points) from park_penalties p
              where p.target_user = u.id and p.status = 'approved'
           ), 0)
     where u.id = new.target_user;
  end if;
  if tg_op = 'UPDATE' and old.target_user is not null and old.target_user <> coalesce(new.target_user, old.target_user) then
    update park_users u
       set penalty_points = coalesce((
             select sum(p.points) from park_penalties p
              where p.target_user = u.id and p.status = 'approved'
           ), 0)
     where u.id = old.target_user;
  end if;
  return new;
end $$;

drop trigger if exists park_penalties_apply on park_penalties;
create trigger park_penalties_apply
  after insert or update on park_penalties
  for each row execute function park_penalty_apply();

-- ---------------------------------------------------------------------
-- 6) ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table park_settings     enable row level security;
alter table park_users        enable row level security;
alter table park_spots        enable row level security;
alter table park_reservations enable row level security;
alter table park_penalties    enable row level security;

-- Nastavení: čte každý přihlášený, mění jen admin
drop policy if exists park_settings_read  on park_settings;
drop policy if exists park_settings_write on park_settings;
create policy park_settings_read  on park_settings for select to authenticated using (true);
create policy park_settings_write on park_settings for all    to authenticated using (park_is_admin()) with check (park_is_admin());

-- Uživatelé: každý vidí jméno kolegů (kvůli obsazeným slotům),
-- upravovat smí jen sebe; admin vše.
drop policy if exists park_users_read       on park_users;
drop policy if exists park_users_update_own on park_users;
drop policy if exists park_users_admin      on park_users;
create policy park_users_read       on park_users for select to authenticated using (true);
create policy park_users_update_own on park_users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy park_users_admin      on park_users for all to authenticated
  using (park_is_admin()) with check (park_is_admin());

-- Ochrana proti povýšení sebe sama: běžný uživatel si smí měnit jen
-- jméno, telefon a SPZ. (Řešeno triggerem, ne politikou — poddotaz nad
-- vlastní tabulkou uvnitř RLS politiky vede k nekonečné rekurzi.)
create or replace function park_users_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() je NULL při volání ze SQL editoru nebo service_role klíčem
  -- (správa a migrace) — tam se neomezujeme.
  if auth.uid() is null or park_is_admin() then
    return new;
  end if;
  new.role           := old.role;
  new.penalty_points := old.penalty_points;
  new.is_active      := old.is_active;
  new.email          := old.email;
  new.id             := old.id;
  return new;
end $$;

drop trigger if exists park_users_guard_trg on park_users;
create trigger park_users_guard_trg
  before update on park_users
  for each row execute function park_users_guard();

-- Místa: čte každý, mění admin
drop policy if exists park_spots_read  on park_spots;
drop policy if exists park_spots_write on park_spots;
create policy park_spots_read  on park_spots for select to authenticated using (true);
create policy park_spots_write on park_spots for all    to authenticated using (park_is_admin()) with check (park_is_admin());

-- Rezervace: vidí všichni (kalendář), zakládá a ruší si každý svoje, admin vše
drop policy if exists park_res_read   on park_reservations;
drop policy if exists park_res_insert on park_reservations;
drop policy if exists park_res_delete on park_reservations;
drop policy if exists park_res_admin  on park_reservations;
create policy park_res_read   on park_reservations for select to authenticated using (true);
create policy park_res_insert on park_reservations for insert to authenticated
  with check (user_id = auth.uid() or park_is_admin());
create policy park_res_delete on park_reservations for delete to authenticated
  using (user_id = auth.uid() or park_is_admin());
create policy park_res_admin  on park_reservations for update to authenticated
  using (park_is_admin()) with check (park_is_admin());

-- Trestné body: hlásit může každý; vidí své vlastní i ta, která se ho týkají; admin vše
drop policy if exists park_pen_insert on park_penalties;
drop policy if exists park_pen_read   on park_penalties;
drop policy if exists park_pen_admin  on park_penalties;
create policy park_pen_insert on park_penalties for insert to authenticated
  with check (reported_by = auth.uid());
create policy park_pen_read   on park_penalties for select to authenticated
  using (reported_by = auth.uid() or target_user = auth.uid() or park_is_admin());
create policy park_pen_admin  on park_penalties for all to authenticated
  using (park_is_admin()) with check (park_is_admin());

-- ---------------------------------------------------------------------
-- 6b) OPRÁVNĚNÍ PRO PŘIHLÁŠENÉ (nad rámec RLS, které rozhoduje o řádcích)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  park_users, park_spots, park_reservations, park_penalties, park_settings
  to authenticated;
grant execute on function park_is_admin(), park_setting_int(text,int), park_setting_bool(text,boolean)
  to authenticated;

-- ---------------------------------------------------------------------
-- 7) PRVNÍ ADMIN
--    Po svém prvním přihlášení do aplikace spusťte:
-- ---------------------------------------------------------------------
-- update park_users set role = 'admin' where email = 'vas.email@gjk.cz';
