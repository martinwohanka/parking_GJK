-- =====================================================================
--  KONTROLA NASTAVENÍ DATABÁZE
--  Vložte celý soubor do Supabase → SQL Editor a spusťte.
--  Nic nemění, jen vypisuje stav.
-- =====================================================================

-- 1) Hlídají se vůbec pravidla? Bez těchto triggerů si každý nasází
--    kolik rezervací chce a limit je jen nápis v aplikaci.
select 'trigger: ' || t.nazev as co,
       case when p.tgname is null then '✖ CHYBÍ'
            when p.tgenabled = 'D' then '✖ VYPNUTÝ'
            else '✔ v pořádku' end as stav
from (values
        ('park_reservations_check', 'park_reservations'),
        ('park_users_domain',       'park_users'),
        ('park_penalties_prepare',  'park_penalties'),
        ('park_penalties_apply',    'park_penalties')
     ) as t(nazev, tabulka)
left join pg_trigger p
       on p.tgname = t.nazev
      and p.tgrelid = t.tabulka::regclass
      and not p.tgisinternal;

-- 2) Platná pravidla
select key as nastaveni, value #>> '{}' as hodnota
  from park_settings order by key;

-- 3) Kdo má kolik rezervovaných dnů v jednotlivých týdnech.
--    Sloupec "pres_limit" ukazuje, kde se limit nedodržel.
select u.email,
       u.role,
       date_trunc('week', lower(r.period) at time zone 'Europe/Prague')::date as tyden_od,
       count(distinct (lower(r.period) at time zone 'Europe/Prague')::date)   as dnu,
       count(*)                                                              as rezervaci,
       case when u.role = 'admin' then 'správce – bez limitu'
            when count(distinct (lower(r.period) at time zone 'Europe/Prague')::date)
                 > greatest((select (value #>> '{}')::int from park_settings where key='weekly_day_limit')
                            - u.penalty_points / nullif((select (value #>> '{}')::int
                                from park_settings where key='penalty_points_per_slot'),0), 0)
            then '✖ PŘES LIMIT' else '✔' end as pres_limit
  from park_reservations r
  join park_users u on u.id = r.user_id
 group by u.email, u.role, u.penalty_points, 3
 order by 3 desc, 1;
