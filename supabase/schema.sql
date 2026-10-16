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
