-- Påmeldinger: skjemaer for arrangementer (Start-turneen og senere andre),
-- med egen backoffice og egne brukere, adskilt fra banebookingen.
-- Samme tilgangsmodell som schema.sql: tabellene er stengt, og serveren går
-- gjennom funksjonene under med SNAK_API_NOKKEL (sjekkes av snak_sjekk).

create table if not exists pam_arrangementer (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  serie text check (serie is null or serie ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  tittel text not null,
  fane text,
  arrangor text not null,
  info text,
  felter jsonb not null default '[]',
  partner text,
  aapen boolean not null default true,
  rekkefolge integer not null default 0,
  opprettet timestamptz not null default now()
);
alter table pam_arrangementer enable row level security;

create table if not exists pam_svar (
  id uuid primary key default gen_random_uuid(),
  arrangement_id uuid not null references pam_arrangementer(id) on delete cascade,
  data jsonb not null,
  opprettet timestamptz not null default now()
);
alter table pam_svar enable row level security;
create index if not exists pam_svar_arrangement on pam_svar (arrangement_id, opprettet);

-- Brukere i påmeldings-backoffice. Admin ser og endrer alt. Arrangør ser bare
-- påmeldinger der `arrangor` står i lista si.
create table if not exists pam_brukere (
  id uuid primary key default gen_random_uuid(),
  epost text not null unique check (epost = lower(epost)),
  navn text not null,
  rolle text not null check (rolle in ('admin', 'arrangor')),
  arrangorer text[] not null default '{}',
  passord_hash text not null,
  aktiv boolean not null default true,
  opprettet timestamptz not null default now(),
  sist_inne timestamptz
);
alter table pam_brukere enable row level security;

create table if not exists pam_logg (
  id bigserial primary key,
  tid timestamptz not null default now(),
  bruker_id uuid,
  hvem text not null,
  handling text not null,
  detaljer text
);
alter table pam_logg enable row level security;
create index if not exists pam_logg_tid on pam_logg (tid desc);

create or replace function pam_hent_arrangementer(p_nokkel text)
returns table (id uuid, slug text, serie text, tittel text, fane text, arrangor text, info text, felter jsonb, partner text, aapen boolean, rekkefolge integer, opprettet timestamptz, antall bigint)
language plpgsql security definer set search_path = public stable as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query
    select a.id, a.slug, a.serie, a.tittel, a.fane, a.arrangor, a.info, a.felter, a.partner, a.aapen, a.rekkefolge, a.opprettet,
           (select count(*) from pam_svar s where s.arrangement_id = a.id)
      from pam_arrangementer a
     order by a.opprettet desc, a.rekkefolge;
end
$fn$;

-- Ny (uten id) eller endring.
create or replace function pam_lagre_arrangement(p_nokkel text, p_a jsonb) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  ny_id uuid;
begin
  perform snak_sjekk(p_nokkel);
  if p_a->>'id' is null then
    insert into pam_arrangementer (slug, serie, tittel, fane, arrangor, info, felter, partner, aapen, rekkefolge)
    values (p_a->>'slug', nullif(p_a->>'serie', ''), p_a->>'tittel', nullif(p_a->>'fane', ''), p_a->>'arrangor',
            nullif(p_a->>'info', ''), coalesce(p_a->'felter', '[]'), nullif(p_a->>'partner', ''),
            coalesce((p_a->>'aapen')::boolean, true), coalesce((p_a->>'rekkefolge')::integer, 0))
    returning id into ny_id;
  else
    update pam_arrangementer set
      slug       = coalesce(p_a->>'slug', slug),
      serie      = case when p_a ? 'serie' then nullif(p_a->>'serie', '') else serie end,
      tittel     = coalesce(p_a->>'tittel', tittel),
      fane       = case when p_a ? 'fane' then nullif(p_a->>'fane', '') else fane end,
      arrangor   = coalesce(p_a->>'arrangor', arrangor),
      info       = case when p_a ? 'info' then nullif(p_a->>'info', '') else info end,
      felter     = coalesce(p_a->'felter', felter),
      partner    = case when p_a ? 'partner' then nullif(p_a->>'partner', '') else partner end,
      aapen      = coalesce((p_a->>'aapen')::boolean, aapen),
      rekkefolge = coalesce((p_a->>'rekkefolge')::integer, rekkefolge)
    where id = (p_a->>'id')::uuid
    returning id into ny_id;
  end if;
  return ny_id;
end
$fn$;

create or replace function pam_hent_svar(p_nokkel text, p_arrangement uuid) returns setof pam_svar
language plpgsql security definer set search_path = public stable as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query select * from pam_svar where arrangement_id = p_arrangement order by opprettet;
end
$fn$;

-- Nye påmeldinger tas bare imot når arrangementet er åpent.
create or replace function pam_nytt_svar(p_nokkel text, p_arrangement uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  ny_id uuid;
begin
  perform snak_sjekk(p_nokkel);
  if not exists (select 1 from pam_arrangementer where id = p_arrangement and aapen) then
    raise exception 'STENGT';
  end if;
  insert into pam_svar (arrangement_id, data) values (p_arrangement, p_data) returning id into ny_id;
  return ny_id;
end
$fn$;

create or replace function pam_slett_svar(p_nokkel text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  delete from pam_svar where id = p_id;
end
$fn$;

create or replace function pam_hent_bruker(p_nokkel text, p_id uuid, p_epost text) returns setof pam_brukere
language plpgsql security definer set search_path = public stable as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query select * from pam_brukere where (p_id is not null and id = p_id) or (p_epost is not null and epost = lower(p_epost));
end
$fn$;

create or replace function pam_hent_brukere(p_nokkel text)
returns table (id uuid, epost text, navn text, rolle text, arrangorer text[], aktiv boolean, opprettet timestamptz, sist_inne timestamptz)
language plpgsql security definer set search_path = public stable as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query select b.id, b.epost, b.navn, b.rolle, b.arrangorer, b.aktiv, b.opprettet, b.sist_inne from pam_brukere b order by b.aktiv desc, b.navn;
end
$fn$;

create or replace function pam_lagre_bruker(p_nokkel text, p_b jsonb) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  ny_id uuid;
begin
  perform snak_sjekk(p_nokkel);
  if p_b->>'id' is null then
    insert into pam_brukere (epost, navn, rolle, arrangorer, passord_hash, aktiv)
    values (lower(p_b->>'epost'), p_b->>'navn', p_b->>'rolle',
            coalesce(array(select jsonb_array_elements_text(p_b->'arrangorer')), '{}'),
            p_b->>'passord_hash', coalesce((p_b->>'aktiv')::boolean, true))
    returning id into ny_id;
  else
    update pam_brukere set
      epost        = coalesce(lower(p_b->>'epost'), epost),
      navn         = coalesce(p_b->>'navn', navn),
      rolle        = coalesce(p_b->>'rolle', rolle),
      arrangorer   = case when p_b ? 'arrangorer' then array(select jsonb_array_elements_text(p_b->'arrangorer')) else arrangorer end,
      aktiv        = coalesce((p_b->>'aktiv')::boolean, aktiv),
      passord_hash = coalesce(p_b->>'passord_hash', passord_hash)
    where id = (p_b->>'id')::uuid
    returning id into ny_id;
  end if;
  return ny_id;
end
$fn$;

create or replace function pam_bruker_inne(p_nokkel text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  update pam_brukere set sist_inne = now() where id = p_id;
end
$fn$;

create or replace function pam_skriv_logg(p_nokkel text, p_bruker uuid, p_hvem text, p_handling text, p_detaljer text) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  insert into pam_logg (bruker_id, hvem, handling, detaljer) values (p_bruker, p_hvem, p_handling, p_detaljer);
end
$fn$;

create or replace function pam_hent_logg(p_nokkel text, p_antall int default 500) returns setof pam_logg
language plpgsql security definer set search_path = public stable as $fn$
begin
  perform snak_sjekk(p_nokkel);
  return query select * from pam_logg order by tid desc limit least(coalesce(p_antall, 500), 5000);
end
$fn$;

-- Start-turneen
insert into pam_arrangementer (slug, serie, tittel, fane, arrangor, felter, partner, rekkefolge) values
  ('start-turneen-trening', 'start-turneen', 'Start-turneen', 'Trening', 'IK Start',
   '[{"id":"navn","type":"tekst","navn":"Deltakers navn","pakrevd":true},
     {"id":"arskull","type":"arskull","navn":"Deltakers årskull","pakrevd":true,"fra":2006,"til":2021},
     {"id":"epost","type":"epost","navn":"E-post til foresatt","pakrevd":true}]', 'start', 1),
  ('start-turneen-seminar', 'start-turneen', 'Start-turneen', 'Seminar', 'IK Start',
   '[{"id":"navn","type":"tekst","navn":"Deltakers navn","pakrevd":true},
     {"id":"epost","type":"epost","navn":"Deltakers e-post","pakrevd":true}]', 'start', 2)
on conflict (slug) do nothing;

-- Menyer som settes opp senere: stengte utkast med standardfelter.
insert into pam_arrangementer (slug, serie, tittel, arrangor, felter, aapen) values
  ('finns-fairway-cup', 'finns-fairway-cup', 'Finns.Fairway Cup', 'Finns.Fairway', '[{"id":"navn","type":"tekst","navn":"Navn","pakrevd":true},{"id":"epost","type":"epost","navn":"E-post","pakrevd":true},{"id":"telefon","type":"telefon","navn":"Telefon","pakrevd":false}]', false),
  ('jentegolf', 'jentegolf', 'Jentegolf', 'Finns.Fairway', '[{"id":"navn","type":"tekst","navn":"Navn","pakrevd":true},{"id":"epost","type":"epost","navn":"E-post","pakrevd":true},{"id":"telefon","type":"telefon","navn":"Telefon","pakrevd":false}]', false),
  ('frivillig', 'frivillig', 'Frivillig', 'Finns.Fairway', '[{"id":"navn","type":"tekst","navn":"Navn","pakrevd":true},{"id":"epost","type":"epost","navn":"E-post","pakrevd":true},{"id":"telefon","type":"telefon","navn":"Telefon","pakrevd":false}]', false)
on conflict (slug) do nothing;

create or replace function pam_slett_svar(p_nokkel text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform snak_sjekk(p_nokkel);
  delete from pam_svar where id = p_id;
end
$fn$;
