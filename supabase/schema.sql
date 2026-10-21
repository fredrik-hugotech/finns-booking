-- Skjema for Finns.Fairway – vinteråpen Sparebanken Norge Arena.
-- Kjør i Supabase SQL Editor. Tabellene leses og skrives kun av serveren
-- (service role); RLS er på uten policyer, så anon-nøkkelen får ingen tilgang.

create table if not exists bestillinger (
  id         uuid primary key default gen_random_uuid(),
  ref        text not null,
  dato       date not null,
  time       smallint not null check (time between 0 and 23),
  bane       text not null check (bane in ('hel', 'halv')),
  status     text not null default 'forespurt' check (status in ('forespurt', 'bekreftet', 'avlyst')),
  navn       text not null,
  telefon    text not null,
  epost      text not null,
  klubb      text,
  kommentar  text,
  pris       integer not null,
  serie      text,
  opprettet  timestamptz not null default now()
);

create index if not exists bestillinger_dato_time on bestillinger (dato, time);
create index if not exists bestillinger_ref on bestillinger (ref);

create table if not exists sperringer (
  id        uuid primary key default gen_random_uuid(),
  dato      date not null,
  fra_time  smallint not null,
  til_time  smallint not null check (til_time > fra_time),
  arsak     text not null
);

alter table bestillinger enable row level security;
alter table sperringer enable row level security;

-- Hindrer overbooking: maks to halvdeler (én hel bane) per dato og time.
-- Låsen per time gjør at to samtidige bestillinger ikke begge slipper gjennom.
create or replace function sjekk_kapasitet() returns trigger
language plpgsql as $$
declare
  brukt integer;
  ny integer := case when new.bane = 'hel' then 2 else 1 end;
begin
  if new.status = 'avlyst' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext(new.dato::text || ':' || new.time::text));
  select coalesce(sum(case when bane = 'hel' then 2 else 1 end), 0)
    into brukt
    from bestillinger
   where dato = new.dato and time = new.time and status <> 'avlyst' and id <> new.id;
  if brukt + ny > 2 then
    raise exception 'OPPTATT %', new.dato || ' ' || new.time;
  end if;
  return new;
end $$;

drop trigger if exists bestillinger_kapasitet on bestillinger;
create trigger bestillinger_kapasitet
  before insert or update of dato, time, bane, status on bestillinger
  for each row execute function sjekk_kapasitet();

-- Sperringer fjernes ved å settes inaktive, så historikken beholdes.
alter table sperringer add column if not exists aktiv boolean not null default true;

-- Serverens tilgang: API-rutene kaller funksjonene under med anon-nøkkelen
-- pluss SNAK_API_NOKKEL. Bare SHA-256 av nøkkelen lagres her. Sett den med:
--   insert into snak_nokkel (hash) values (encode(sha256(convert_to('<nøkkel>', 'UTF8')), 'hex'));
create table if not exists snak_nokkel (hash text primary key);
alter table snak_nokkel enable row level security;

create or replace function snak_sjekk(p_nokkel text) returns void
language plpgsql security definer set search_path = public stable as $fn$
begin
  if p_nokkel is null or not exists (select 1 from snak_nokkel where hash = encode(sha256(convert_to(p_nokkel, 'UTF8')), 'hex')) then
    raise exception 'IKKE_TILGANG' using errcode = '42501';
  end if;
end
$fn$;

create or replace function snak_hent_bestillinger(p_nokkel text, p_fra date default null) returns setof bestillinger
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query select * from bestillinger where p_fra is null or dato >= p_fra order by dato, time, opprettet;
end
$fn$;

create or replace function snak_hent_sperringer(p_nokkel text) returns setof sperringer
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query select * from sperringer where aktiv order by dato, fra_time;
end
$fn$;

create or replace function snak_lagre_bestillinger(p_nokkel text, p_linjer jsonb) returns setof bestillinger
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query
    insert into bestillinger (ref, dato, time, bane, navn, telefon, epost, klubb, kommentar, pris, serie)
    select ref, dato, time, bane, navn, telefon, epost, klubb, kommentar, pris, serie
      from jsonb_to_recordset(p_linjer) as x(ref text, dato date, time smallint, bane text, navn text, telefon text, epost text, klubb text, kommentar text, pris integer, serie text)
    returning *;
end
$fn$;

create or replace function snak_sett_status(p_nokkel text, p_ider uuid[], p_status text) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  update bestillinger set status = p_status where id = any(p_ider);
end
$fn$;

create or replace function snak_lagre_sperring(p_nokkel text, p_dato date, p_fra smallint, p_til smallint, p_arsak text) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  insert into sperringer (dato, fra_time, til_time, arsak) values (p_dato, p_fra, p_til, p_arsak);
end
$fn$;

create or replace function snak_fjern_sperring(p_nokkel text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  update sperringer set aktiv = false where id = p_id;
end
$fn$;

-- Admin: endre tid, bane, pris eller kontaktinfo på én eller flere linjer.
-- Kapasitetstriggeren over sjekker fortsatt at flyttede timer er ledige.
create or replace function snak_oppdater_bestillinger(p_nokkel text, p_ider uuid[], p_endringer jsonb) returns setof bestillinger
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query
    update bestillinger set
      dato      = coalesce((p_endringer->>'dato')::date, dato),
      time      = coalesce((p_endringer->>'time')::smallint, time),
      bane      = coalesce(p_endringer->>'bane', bane),
      pris      = coalesce((p_endringer->>'pris')::integer, pris),
      navn      = coalesce(p_endringer->>'navn', navn),
      telefon   = coalesce(p_endringer->>'telefon', telefon),
      epost     = coalesce(p_endringer->>'epost', epost),
      klubb     = case when p_endringer ? 'klubb' then nullif(p_endringer->>'klubb', '') else klubb end,
      kommentar = case when p_endringer ? 'kommentar' then nullif(p_endringer->>'kommentar', '') else kommentar end
    where id = any(p_ider)
    returning *;
end
$fn$;

-- Priser per time, endres fra admin. Ett jsonb-dokument:
-- { "ukedag": { "hel": 1990, "halv": 1490 }, "helg": { "hel": 1990, "halv": 1490 } }
create table if not exists snak_innstillinger (nokkel text primary key, verdi jsonb not null);
alter table snak_innstillinger enable row level security;
insert into snak_innstillinger (nokkel, verdi)
  values ('priser', '{"ukedag":{"hel":1990,"halv":1490},"helg":{"hel":1990,"halv":1490}}')
  on conflict (nokkel) do nothing;

create or replace function snak_hent_priser(p_nokkel text) returns jsonb
language plpgsql security definer set search_path = public stable as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return (select verdi from snak_innstillinger where nokkel = 'priser');
end
$fn$;

create or replace function snak_lagre_priser(p_nokkel text, p_priser jsonb) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  insert into snak_innstillinger (nokkel, verdi) values ('priser', p_priser)
    on conflict (nokkel) do update set verdi = excluded.verdi;
end
$fn$;

-- Klubbenes faste ukentlige tider. Endres i admin under Klubber.
-- `unntak` er datoer der tida er frigitt og kan bookes av andre.
create table if not exists snak_klubbtider (
  id uuid primary key default gen_random_uuid(),
  dag smallint not null check (dag between 1 and 7),
  fra text not null check (fra ~ '^\d\d:[03]0$'),
  til text not null check (til ~ '^\d\d:[03]0$' and til > fra),
  bane text not null default 'hel' check (bane in ('hel', 'halv')),
  klubb text not null,
  lag text,
  kontakt text,
  telefon text,
  epost text,
  unntak date[] not null default '{}',
  aktiv boolean not null default true,
  opprettet timestamptz not null default now()
);
alter table snak_klubbtider enable row level security;

create or replace function snak_hent_klubbtider(p_nokkel text) returns setof snak_klubbtider
language plpgsql security definer set search_path = public stable as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query select * from snak_klubbtider where aktiv order by dag, fra, klubb;
end
$fn$;

-- Ny (uten id) eller endret klubbtid.
create or replace function snak_lagre_klubbtid(p_nokkel text, p_k jsonb) returns snak_klubbtider
language plpgsql security definer set search_path = public as $fn$
declare
  rad snak_klubbtider;
begin
  perform snak_sjekk(p_nokkel);
  if p_k->>'id' is null then
    insert into snak_klubbtider (dag, fra, til, bane, klubb, lag, kontakt, telefon, epost, unntak)
    values ((p_k->>'dag')::smallint, p_k->>'fra', p_k->>'til', p_k->>'bane', p_k->>'klubb', nullif(p_k->>'lag', ''),
            nullif(p_k->>'kontakt', ''), nullif(p_k->>'telefon', ''), nullif(p_k->>'epost', ''),
            coalesce((select array_agg(d::date) from jsonb_array_elements_text(p_k->'unntak') d), '{}'))
    returning * into rad;
  else
    update snak_klubbtider set
      dag = (p_k->>'dag')::smallint, fra = p_k->>'fra', til = p_k->>'til', bane = p_k->>'bane',
      klubb = p_k->>'klubb', lag = nullif(p_k->>'lag', ''),
      kontakt = nullif(p_k->>'kontakt', ''), telefon = nullif(p_k->>'telefon', ''), epost = nullif(p_k->>'epost', ''),
      unntak = coalesce((select array_agg(d::date) from jsonb_array_elements_text(p_k->'unntak') d), '{}')
    where id = (p_k->>'id')::uuid and aktiv
    returning * into rad;
  end if;
  return rad;
end
$fn$;

create or replace function snak_fjern_klubbtid(p_nokkel text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  update snak_klubbtider set aktiv = false where id = p_id;
end
$fn$;
-- Startdata (Ark 2) genereres fra lib/klubbtider-start.ts.

-- Brukere i backoffice. Admin kan endre alt; innsyn ser bare hvem som har
-- banen. Passord lagres som scrypt-hash (lages på serveren, se lib/tilgang.ts).
create table if not exists snak_brukere (
  id uuid primary key default gen_random_uuid(),
  epost text not null unique check (epost = lower(epost)),
  navn text not null,
  rolle text not null check (rolle in ('admin', 'innsyn')),
  passord_hash text not null,
  aktiv boolean not null default true,
  opprettet timestamptz not null default now(),
  sist_inne timestamptz
);
alter table snak_brukere enable row level security;

-- Én bruker etter id eller e-post (med hash, kun for serveren).
create or replace function snak_hent_bruker(p_nokkel text, p_id uuid, p_epost text) returns setof snak_brukere
language plpgsql security definer set search_path = public stable as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query select * from snak_brukere where (p_id is not null and id = p_id) or (p_epost is not null and epost = lower(p_epost));
end
$fn$;

create or replace function snak_hent_brukere(p_nokkel text)
returns table (id uuid, epost text, navn text, rolle text, aktiv boolean, opprettet timestamptz, sist_inne timestamptz)
language plpgsql security definer set search_path = public stable as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query select b.id, b.epost, b.navn, b.rolle, b.aktiv, b.opprettet, b.sist_inne from snak_brukere b order by b.aktiv desc, b.navn;
end
$fn$;

-- Ny bruker (uten id) eller endring. Passord endres bare når hash er med.
create or replace function snak_lagre_bruker(p_nokkel text, p_b jsonb) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  ny_id uuid;
begin
  perform snak_sjekk(p_nokkel);
  if p_b->>'id' is null then
    insert into snak_brukere (epost, navn, rolle, passord_hash, aktiv)
    values (lower(p_b->>'epost'), p_b->>'navn', p_b->>'rolle', p_b->>'passord_hash', coalesce((p_b->>'aktiv')::boolean, true))
    returning id into ny_id;
  else
    update snak_brukere set
      epost = coalesce(lower(p_b->>'epost'), epost),
      navn = coalesce(p_b->>'navn', navn),
      rolle = coalesce(p_b->>'rolle', rolle),
      aktiv = coalesce((p_b->>'aktiv')::boolean, aktiv),
      passord_hash = coalesce(p_b->>'passord_hash', passord_hash)
    where id = (p_b->>'id')::uuid
    returning id into ny_id;
  end if;
  return ny_id;
end
$fn$;

create or replace function snak_bruker_inne(p_nokkel text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  update snak_brukere set sist_inne = now() where id = p_id;
end
$fn$;

-- Logg over alt som skjer i backoffice: hvem, hva og når. Kan bare skrives
-- til og leses, aldri endres eller slettes via API-et.
create table if not exists snak_logg (
  id bigserial primary key,
  tid timestamptz not null default now(),
  bruker_id uuid,
  hvem text not null,
  handling text not null,
  detaljer text
);
alter table snak_logg enable row level security;
create index if not exists snak_logg_tid on snak_logg (tid desc);

create or replace function snak_skriv_logg(p_nokkel text, p_bruker uuid, p_hvem text, p_handling text, p_detaljer text) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  insert into snak_logg (bruker_id, hvem, handling, detaljer) values (p_bruker, p_hvem, p_handling, p_detaljer);
end
$fn$;

create or replace function snak_hent_logg(p_nokkel text, p_antall int default 500) returns setof snak_logg
language plpgsql security definer set search_path = public stable as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query select * from snak_logg order by tid desc limit least(coalesce(p_antall, 500), 5000);
end
$fn$;

-- Holdte timer: når noen velger timer på bookingsiden, holdes de av i noen
-- minutter så førstemann får dem mens skjemaet fylles ut. `okt` er en
-- tilfeldig id per nettleser. Utløpte rader teller ikke og ryddes bort.
create table if not exists snak_holdt (
  okt     text not null,
  dato    date not null,
  time    smallint not null,
  bane    text not null check (bane in ('hel', 'halv')),
  utloper timestamptz not null,
  primary key (okt, dato, time)
);
alter table snak_holdt enable row level security;
create index if not exists snak_holdt_tid on snak_holdt (dato, time);

-- Kapasitetssjekken teller nå også andres holdte timer.
create or replace function sjekk_kapasitet() returns trigger
language plpgsql as $$
declare
  brukt integer;
  ny integer := case when new.bane = 'hel' then 2 else 1 end;
begin
  if new.status = 'avlyst' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext(new.dato::text || ':' || new.time::text));
  select coalesce(sum(case when bane = 'hel' then 2 else 1 end), 0)
    into brukt
    from bestillinger
   where dato = new.dato and time = new.time and status <> 'avlyst' and id <> new.id;
  brukt := brukt + coalesce((select sum(case when bane = 'hel' then 2 else 1 end) from snak_holdt
                             where dato = new.dato and time = new.time and utloper > now()), 0);
  if brukt + ny > 2 then
    raise exception 'OPPTATT %', new.dato || ' ' || new.time;
  end if;
  return new;
end $$;

-- Hold av timer for en økt. Erstatter øktas tidligere holdte timer (de
-- gamle settes som utløpt). `plass` per linje er halvdelene som er ledige
-- etter klubbtider og sperringer (regnes på serveren). Svarer med linjene
-- som ikke fikk plass. Låsen er den samme som i kapasitetstriggeren, så
-- to som velger samme time samtidig blir avgjort i rekkefølge.
create or replace function snak_hold(p_nokkel text, p_okt text, p_linjer jsonb, p_minutter integer)
returns table (avvist_dato date, avvist_time smallint)
language plpgsql security definer set search_path = public as $fn$
declare
  r record;
  brukt integer;
begin
  perform snak_sjekk(p_nokkel);
  update snak_holdt set utloper = now() - interval '1 second' where okt = p_okt;
  for r in select * from jsonb_to_recordset(p_linjer) as x(dato date, time smallint, bane text, plass integer) order by 1, 2 loop
    perform pg_advisory_xact_lock(hashtext(r.dato::text || ':' || r.time::text));
    select coalesce(sum(case when b.bane = 'hel' then 2 else 1 end), 0) into brukt
      from bestillinger b where b.dato = r.dato and b.time = r.time and b.status <> 'avlyst';
    brukt := brukt + coalesce((select sum(case when h.bane = 'hel' then 2 else 1 end) from snak_holdt h
                               where h.dato = r.dato and h.time = r.time and h.okt <> p_okt and h.utloper > now()), 0);
    if brukt + (case when r.bane = 'hel' then 2 else 1 end) > r.plass then
      avvist_dato := r.dato;
      avvist_time := r.time;
      return next;
    else
      insert into snak_holdt (okt, dato, time, bane, utloper)
      values (p_okt, r.dato, r.time, r.bane, now() + make_interval(mins => p_minutter))
      on conflict on constraint snak_holdt_pkey do update set bane = excluded.bane, utloper = excluded.utloper;
    end if;
  end loop;
end
$fn$;

-- Andres holdte timer (for visningen av ledige timer).
create or replace function snak_hent_holdt(p_nokkel text, p_okt text)
returns table (h_dato date, h_time smallint, h_bane text)
language plpgsql security definer set search_path = public stable as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query select h.dato, h.time, h.bane from snak_holdt h
    where h.utloper > now() and (p_okt is null or h.okt <> p_okt);
end
$fn$;

-- Bestill: slipper øktas holdte timer og lagrer bestillingen i samme
-- transaksjon, så ingen kan snike seg imellom.
create or replace function snak_bestill(p_nokkel text, p_okt text, p_linjer jsonb) returns setof bestillinger
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  if p_okt is not null then
    delete from snak_holdt where okt = p_okt;
  end if;
  return query
    insert into bestillinger (ref, dato, time, bane, navn, telefon, epost, klubb, kommentar, pris, serie)
    select ref, dato, time, bane, navn, telefon, epost, klubb, kommentar, pris, serie
      from jsonb_to_recordset(p_linjer) as x(ref text, dato date, time smallint, bane text, navn text, telefon text, epost text, klubb text, kommentar text, pris integer, serie text)
    returning *;
end
$fn$;

-- ------------------------------------------------------------------
-- Halvtimer. En booking starter på hel eller halv time (`minutt` 0/30)
-- og varer 30 eller 60 minutter (`lengde`). Kapasitet sjekkes per
-- halvtime, og holdte timer lagres per halvtime i snak_holdt_halv.
-- (snak_holdt, snak_hold og snak_hent_holdt over er erstattet av dette.)
-- ------------------------------------------------------------------
alter table bestillinger add column if not exists minutt smallint not null default 0;
alter table bestillinger add column if not exists lengde smallint not null default 60;
alter table bestillinger add constraint bestillinger_minutt_sjekk check (minutt in (0, 30));
alter table bestillinger add constraint bestillinger_lengde_sjekk check (lengde in (30, 60));

create table if not exists snak_holdt_halv (
  okt     text not null,
  dato    date not null,
  start   smallint not null,          -- minutter etter midnatt, delelig med 30
  bane    text not null check (bane in ('hel', 'halv')),
  utloper timestamptz not null,
  primary key (okt, dato, start)
);
alter table snak_holdt_halv enable row level security;
create index if not exists snak_holdt_halv_tid on snak_holdt_halv (dato, start);

create or replace function sjekk_kapasitet() returns trigger
language plpgsql as $$
declare
  brukt integer;
  ny integer := case when new.bane = 'hel' then 2 else 1 end;
  s0 integer := new.time * 60 + new.minutt;
  s integer;
begin
  if new.status = 'avlyst' then
    return new;
  end if;
  s := s0;
  while s < s0 + new.lengde loop
    perform pg_advisory_xact_lock(hashtext(new.dato::text || ':' || s::text));
    select coalesce(sum(case when b.bane = 'hel' then 2 else 1 end), 0) into brukt
      from bestillinger b
     where b.dato = new.dato and b.status <> 'avlyst' and b.id <> new.id
       and b.time * 60 + b.minutt <= s and b.time * 60 + b.minutt + b.lengde > s;
    brukt := brukt + coalesce((select sum(case when h.bane = 'hel' then 2 else 1 end) from snak_holdt_halv h
                               where h.dato = new.dato and h.start = s and h.utloper > now()), 0);
    if brukt + ny > 2 then
      raise exception 'OPPTATT %', new.dato || ' ' || s;
    end if;
    s := s + 30;
  end loop;
  return new;
end $$;
create trigger bestillinger_kapasitet_lengde
  before update of minutt, lengde on bestillinger
  for each row execute function sjekk_kapasitet();

create or replace function snak_hent_holdt_halv(p_nokkel text, p_okt text)
returns table (h_dato date, h_start smallint, h_bane text)
language plpgsql security definer set search_path = public stable as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query select h.dato, h.start, h.bane from snak_holdt_halv h
    where h.utloper > now() and (p_okt is null or h.okt <> p_okt);
end
$fn$;

-- Hold av halvtimer for en økt (erstatter det økta holdt før). `plass` er
-- ledige halvdeler etter klubbtider og sperringer. Svarer med halvtimene
-- som ikke fikk plass.
create or replace function snak_hold_halv(p_nokkel text, p_okt text, p_linjer jsonb, p_minutter integer)
returns table (avvist_dato date, avvist_start smallint)
language plpgsql security definer set search_path = public as $fn$
declare
  r record;
  brukt integer;
begin
  perform snak_sjekk(p_nokkel);
  update snak_holdt_halv set utloper = now() - interval '1 second' where okt = p_okt;
  for r in select * from jsonb_to_recordset(p_linjer) as x(dato date, start smallint, bane text, plass integer) order by 1, 2 loop
    perform pg_advisory_xact_lock(hashtext(r.dato::text || ':' || r.start::text));
    select coalesce(sum(case when b.bane = 'hel' then 2 else 1 end), 0) into brukt
      from bestillinger b
     where b.dato = r.dato and b.status <> 'avlyst'
       and b.time * 60 + b.minutt <= r.start and b.time * 60 + b.minutt + b.lengde > r.start;
    brukt := brukt + coalesce((select sum(case when h.bane = 'hel' then 2 else 1 end) from snak_holdt_halv h
                               where h.dato = r.dato and h.start = r.start and h.okt <> p_okt and h.utloper > now()), 0);
    if brukt + (case when r.bane = 'hel' then 2 else 1 end) > r.plass then
      avvist_dato := r.dato;
      avvist_start := r.start;
      return next;
    else
      insert into snak_holdt_halv (okt, dato, start, bane, utloper)
      values (p_okt, r.dato, r.start, r.bane, now() + make_interval(mins => p_minutter))
      on conflict on constraint snak_holdt_halv_pkey do update set bane = excluded.bane, utloper = excluded.utloper;
    end if;
  end loop;
end
$fn$;

create or replace function snak_bestill(p_nokkel text, p_okt text, p_linjer jsonb) returns setof bestillinger
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  if p_okt is not null then
    update snak_holdt_halv set utloper = now() - interval '1 second' where okt = p_okt;
  end if;
  return query
    insert into bestillinger (ref, dato, time, minutt, lengde, bane, navn, telefon, epost, klubb, kommentar, pris, serie)
    select ref, dato, time, coalesce(minutt, 0), coalesce(lengde, 60), bane, navn, telefon, epost, klubb, kommentar, pris, serie
      from jsonb_to_recordset(p_linjer) as x(ref text, dato date, time smallint, minutt smallint, lengde smallint, bane text, navn text, telefon text, epost text, klubb text, kommentar text, pris integer, serie text)
    returning *;
end
$fn$;

create or replace function snak_lagre_bestillinger(p_nokkel text, p_linjer jsonb) returns setof bestillinger
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query
    insert into bestillinger (ref, dato, time, minutt, lengde, bane, navn, telefon, epost, klubb, kommentar, pris, serie)
    select ref, dato, time, coalesce(minutt, 0), coalesce(lengde, 60), bane, navn, telefon, epost, klubb, kommentar, pris, serie
      from jsonb_to_recordset(p_linjer) as x(ref text, dato date, time smallint, minutt smallint, lengde smallint, bane text, navn text, telefon text, epost text, klubb text, kommentar text, pris integer, serie text)
    returning *;
end
$fn$;

create or replace function snak_oppdater_bestillinger(p_nokkel text, p_ider uuid[], p_endringer jsonb) returns setof bestillinger
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query
    update bestillinger set
      dato      = coalesce((p_endringer->>'dato')::date, dato),
      time      = coalesce((p_endringer->>'time')::smallint, time),
      minutt    = coalesce((p_endringer->>'minutt')::smallint, minutt),
      lengde    = coalesce((p_endringer->>'lengde')::smallint, lengde),
      bane      = coalesce(p_endringer->>'bane', bane),
      pris      = coalesce((p_endringer->>'pris')::integer, pris),
      navn      = coalesce(p_endringer->>'navn', navn),
      telefon   = coalesce(p_endringer->>'telefon', telefon),
      epost     = coalesce(p_endringer->>'epost', epost),
      klubb     = case when p_endringer ? 'klubb' then nullif(p_endringer->>'klubb', '') else klubb end,
      kommentar = case when p_endringer ? 'kommentar' then nullif(p_endringer->>'kommentar', '') else kommentar end
    where id = any(p_ider)
    returning *;
end
$fn$;
