-- Supabase SQL for Finns.Fairway bookingløsningen.
-- Lim inn hele skriptet i Supabase SQL editor og kjør det én gang.

-- 1. Aktiver nødvendig utvidelse for uuid-generering.
create extension if not exists "pgcrypto";

-- 2. Tabell for lagring av bookingrader.
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  date date not null,
  time text not null,
  lane text not null check (lane in ('half', 'full')),
  name text not null,
  phone text not null,
  email text not null,
  club text not null,
  gender text not null,
  age smallint not null check (age between 0 and 120),
  note text,
  constraint bookings_time_format check (time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
);

-- 3. Indeks som gjør oppslag på dato/tid raskere.
create index if not exists bookings_date_time_idx on public.bookings (date, time);

-- 4. Trigger som sikrer at maks to halvbaner eller én full bane kan reserveres per tidspunkt.
create or replace function public.bookings_enforce_capacity()
returns trigger as
$$
declare
  occupied integer;
  slot_key bigint;
  previous_id uuid;
begin
  if tg_op = 'UPDATE' then
    previous_id := old.id;
  else
    previous_id := null;
  end if;

  -- Sørg for at samtidige operasjoner på samme tids-slot serialiseres.
  slot_key := hashtextextended(new.date::text || '|' || new.time, 0);
  perform pg_advisory_xact_lock(slot_key);

  -- Summer eksisterende reservasjoner for samme tidspunkt (ekskludert raden som oppdateres).
  select coalesce(sum(case when lane = 'full' then 2 else 1 end), 0)
    into occupied
    from public.bookings
   where date = new.date
     and time = new.time
     and (previous_id is null or id <> previous_id);

  -- Blokker halv bane dersom full bane allerede er reservert.
  if new.lane = 'half' then
    if exists (
      select 1
        from public.bookings
       where date = new.date
         and time = new.time
         and lane = 'full'
         and (previous_id is null or id <> previous_id)
    ) then
      raise exception 'Full bane er allerede reservert for % kl. %', new.date, new.time;
    end if;
  end if;

  -- Legg til enhetene til den nye raden og sjekk om kapasiteten overskrides.
  occupied := occupied + case when new.lane = 'full' then 2 else 1 end;
  if occupied > 2 then
    raise exception 'Ingen kapasitet igjen for % kl. %', new.date, new.time;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger bookings_enforce_capacity_trg
before insert or update on public.bookings
for each row
execute function public.bookings_enforce_capacity();

-- 5. Slå på radnivå-sikkerhet og lag åpne policies for lesing og booking.
alter table public.bookings enable row level security;

do
$$
begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'bookings'
       and policyname = 'Public read bookings'
  ) then
    create policy "Public read bookings"
      on public.bookings
      for select
      using (true);
  end if;
end;
$$;

do
$$
begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'bookings'
       and policyname = 'Public insert bookings'
  ) then
    create policy "Public insert bookings"
      on public.bookings
      for insert
      with check (true);
  end if;
end;
$$;

-- 6. Registrer tabellen hos Supabase Realtime dersom den ikke allerede er lagt til.
do
$$
begin
  begin
    alter publication supabase_realtime add table public.bookings;
  exception
    when duplicate_object then null;
  end;
end;
$$;
