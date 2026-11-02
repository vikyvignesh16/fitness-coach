-- Things Vicky does: runs, meals, gym, weekly check ins.

create table runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  coros_id text not null,           -- COROS activity id, makes ingest safe to repeat
  started_at timestamptz not null,
  distance_km numeric not null,
  duration_s int not null,
  avg_hr int,
  elevation_m numeric,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, coros_id)
);

create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  eaten_at timestamptz not null default now(),
  description text,
  -- model estimates are ranges, never one number
  kcal_low int, kcal_high int,
  protein_low_g int, protein_high_g int,
  photo_path text,                  -- path in the private bucket, never a public URL
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  check (kcal_low is null or kcal_high >= kcal_low),
  check (protein_low_g is null or protein_high_g >= protein_low_g)
);

create table gym_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  date date not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table gym_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  session_id uuid not null references gym_sessions(id) on delete cascade,
  exercise text not null,
  set_no int not null,
  reps int,
  load_kg numeric,
  rir int
);

create table checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  week_start date not null,
  morning_weight_kg numeric,
  feeling text,
  pain_score int check (pain_score between 0 and 10),
  -- swelling, giving_way, gait_change, cannot_bear_weight
  pain_flags text[] not null default '{}',
  review jsonb,                     -- model review, after safety checks
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);
