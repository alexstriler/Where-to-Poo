-- Where To Poo — full database schema.
--
-- HOW TO USE: open your Supabase project -> SQL Editor -> New query, paste this
-- whole file, and hit Run. It is safe to run more than once.
--
-- Design notes:
--   * lat/lng are the stored truth; the PostGIS `location` column is generated
--     from them, so the app inserts two plain numbers and never builds geometry.
--   * Everyone can read. Only signed-in users can write, and only their own rows.
--   * Trust is computed in the database (see `restrooms_with_scores`), never on
--     the phone, so a modified client can't fake a restroom's confidence.

set search_path = public, extensions;

create extension if not exists postgis with schema extensions;


-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'restroom_kind') then
    create type restroom_kind as enum (
      'public','park','transit','cafe','restaurant',
      'store','gas_station','mall','library','other'
    );
  end if;
end
$$;

create table if not exists public.restrooms (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(trim(name)) between 1 and 80),
  kind               restroom_kind not null default 'public',

  lat                double precision not null check (lat between -90 and 90),
  lng                double precision not null check (lng between -180 and 180),
  -- Generated from lat/lng purely so PostGIS can do fast radius search.
  location           geography(Point, 4326)
                       generated always as
                       (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,

  is_free            boolean not null default true,
  requires_purchase  boolean not null default false,
  is_accessible      boolean,
  has_changing_table boolean,
  hours              text check (char_length(hours) <= 120),
  address            text check (char_length(address) <= 200),
  notes              text check (char_length(notes) <= 500),

  -- 'osm' rows come from the OpenStreetMap seed script and have no author.
  source             text not null default 'user' check (source in ('user','osm')),
  osm_id             bigint unique,

  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  is_removed         boolean not null default false
);

-- The index that makes "restrooms within 1.5 km of me" fast.
create index if not exists restrooms_location_idx
  on public.restrooms using gist (location);
create index if not exists restrooms_created_by_idx
  on public.restrooms (created_by);

create table if not exists public.restroom_votes (
  id          uuid primary key default gen_random_uuid(),
  restroom_id uuid not null references public.restrooms(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- +1 = "still here", -1 = "it's gone"
  vote        smallint not null check (vote in (-1, 1)),
  created_at  timestamptz not null default now(),
  -- One vote per person per restroom. Upsert to change your mind.
  unique (restroom_id, user_id)
);

create index if not exists restroom_votes_restroom_idx
  on public.restroom_votes (restroom_id);


-- ---------------------------------------------------------------------------
-- Row Level Security: read is public, writes are owner-scoped
-- ---------------------------------------------------------------------------

alter table public.restrooms      enable row level security;
alter table public.restroom_votes enable row level security;

drop policy if exists "restrooms_read_all"   on public.restrooms;
drop policy if exists "restrooms_insert_own" on public.restrooms;
drop policy if exists "restrooms_update_own" on public.restrooms;
drop policy if exists "restrooms_delete_own" on public.restrooms;

-- Anyone, signed in or not, can find a restroom. Travellers who need one right
-- now should never hit a login wall.
create policy "restrooms_read_all"
  on public.restrooms for select
  using (true);

-- Signed-in only, and you must be the author. `source = 'user'` stops anyone
-- from passing off a submission as imported OpenStreetMap data.
create policy "restrooms_insert_own"
  on public.restrooms for insert to authenticated
  with check (auth.uid() = created_by and source = 'user');

create policy "restrooms_update_own"
  on public.restrooms for update to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "restrooms_delete_own"
  on public.restrooms for delete to authenticated
  using (auth.uid() = created_by);

drop policy if exists "votes_read_all"   on public.restroom_votes;
drop policy if exists "votes_insert_own" on public.restroom_votes;
drop policy if exists "votes_update_own" on public.restroom_votes;
drop policy if exists "votes_delete_own" on public.restroom_votes;

create policy "votes_read_all"
  on public.restroom_votes for select
  using (true);

create policy "votes_insert_own"
  on public.restroom_votes for insert to authenticated
  with check (auth.uid() = user_id);

create policy "votes_update_own"
  on public.restroom_votes for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "votes_delete_own"
  on public.restroom_votes for delete to authenticated
  using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- Trust model
-- ---------------------------------------------------------------------------

-- Raw vote tallies per restroom.
create or replace view public.restroom_scores
with (security_invoker = on) as
select
  r.id                                                        as restroom_id,
  coalesce(count(*) filter (where v.vote = 1), 0)::int         as up,
  coalesce(count(*) filter (where v.vote = -1), 0)::int        as down,
  coalesce(sum(v.vote), 0)::int                                as score,
  max(v.created_at) filter (where v.vote = 1)                  as last_confirmed_at
from public.restrooms r
left join public.restroom_votes v on v.restroom_id = r.id
group by r.id;

-- Restrooms plus their trust rating.
--
-- Recency is deliberately part of the test, not just raw score: a restroom last
-- confirmed in 2019 tells a traveller nothing today. That decay is what stops
-- crowdsourced data from quietly rotting.
create or replace view public.restrooms_with_scores
with (security_invoker = on) as
select
  r.id, r.name, r.kind, r.lat, r.lng,
  r.is_free, r.requires_purchase, r.is_accessible, r.has_changing_table,
  r.hours, r.address, r.notes, r.source, r.created_by, r.created_at,
  r.is_removed, r.location,
  s.up, s.down, s.score, s.last_confirmed_at,
  -- Kept as a column so /me and the map agree without duplicating the rules.
  null::double precision as distance_m,
  case
    when s.score <= -3 then 'likely_gone'
    when s.score >= 2
     and coalesce(s.last_confirmed_at, r.created_at) > now() - interval '180 days'
      then 'confirmed'
    else 'unverified'
  end as confidence
from public.restrooms r
join public.restroom_scores s on s.restroom_id = r.id;


-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------

-- Everything the map needs in one round trip: radius filter (index-backed via
-- st_dwithin), distance, sort, and confidence.
create or replace function public.nearby_restrooms(
  in_lat      double precision,
  in_lng      double precision,
  in_radius_m integer default 1500,
  in_limit    integer default 100
)
returns table (
  id                 uuid,
  name               text,
  kind               restroom_kind,
  lat                double precision,
  lng                double precision,
  is_free            boolean,
  requires_purchase  boolean,
  is_accessible      boolean,
  has_changing_table boolean,
  hours              text,
  address            text,
  notes              text,
  source             text,
  created_at         timestamptz,
  distance_m         double precision,
  up                 int,
  down               int,
  score              int,
  confidence         text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    w.id, w.name, w.kind, w.lat, w.lng,
    w.is_free, w.requires_purchase, w.is_accessible, w.has_changing_table,
    w.hours, w.address, w.notes, w.source, w.created_at,
    st_distance(
      w.location,
      st_setsrid(st_makepoint(in_lng, in_lat), 4326)::geography
    ) as distance_m,
    w.up, w.down, w.score, w.confidence
  from public.restrooms_with_scores w
  where w.is_removed = false
    -- Comprehensively downvoted pins stop being shown at all.
    and w.score > -5
    and st_dwithin(
      w.location,
      st_setsrid(st_makepoint(in_lng, in_lat), 4326)::geography,
      greatest(in_radius_m, 1)
    )
  order by distance_m
  limit least(greatest(in_limit, 1), 300);
$$;


-- ---------------------------------------------------------------------------
-- Grants (Supabase grants these by default; stated explicitly so a fresh
-- project and a locked-down one behave the same)
-- ---------------------------------------------------------------------------

grant select on public.restroom_scores       to anon, authenticated;
grant select on public.restrooms_with_scores to anon, authenticated;
grant execute on function public.nearby_restrooms(
  double precision, double precision, integer, integer
) to anon, authenticated;
