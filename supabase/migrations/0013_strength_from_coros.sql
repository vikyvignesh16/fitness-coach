-- Gym sessions and sets as the COROS watch recorded them. Filled by ingest/coros_gym.py.
-- These are separate from the hand ticked gym_sessions and gym_sets, so the watch data never overwrites a tick,
-- and two strength sessions on the same day are fine. The old gym log stays as it was.
-- A value COROS did not give stays empty, never zero. A set with no weight (body weight) has an empty weight_kg.
-- Your note is private text. It stays in your database, readable only by you, and never goes to COROS.
-- A "day" is the Europe/Paris calendar date.

create table strength_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  coros_id text not null,                                       -- COROS activity id, makes the job safe to repeat
  started_at timestamptz not null,
  day date not null,
  workout_name text check (char_length(workout_name) <= 120),   -- your COROS template name, like Legs Version 1
  duration_s int check (duration_s between 0 and 86400),        -- workout time
  total_time_s int check (total_time_s between 0 and 86400),    -- including rests
  sets_count int check (sets_count between 0 and 1000),         -- the set count COROS shows
  avg_hr int check (avg_hr between 30 and 250),
  calories int check (calories between 0 and 20000),
  training_load int check (training_load between 0 and 2000),
  aerobic_te numeric(3, 1) check (aerobic_te between 0 and 10),
  anaerobic_te numeric(3, 1) check (anaerobic_te between 0 and 10),
  training_focus text check (char_length(training_focus) <= 60),
  perceived_effort text check (char_length(perceived_effort) <= 60),
  workout_note text check (char_length(workout_note) <= 5000),
  detail_fetched_at timestamptz,                                -- when details and sets were last read
  created_at timestamptz not null default now(),
  unique (user_id, coros_id)
);
create index strength_sessions_day on strength_sessions (user_id, day);

create table strength_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  session_id uuid not null references strength_sessions(id) on delete cascade,
  position int not null check (position between 1 and 1000),    -- order in the session, 1 first
  exercise text not null check (char_length(exercise) <= 120),
  reps int check (reps between 0 and 1000),
  weight_kg numeric(7, 2) check (weight_kg between 0 and 1000), -- empty for body weight
  seconds numeric(8, 2) check (seconds between 0 and 86400),
  avg_hr int check (avg_hr between 30 and 250),
  max_hr int check (max_hr between 30 and 250),
  unique (session_id, position)
);

-- Read your own rows. Only the COROS job (service role) writes.
alter table strength_sessions enable row level security;
alter table strength_sets enable row level security;
revoke all on strength_sessions, strength_sets from anon;
revoke insert, update, delete, truncate on strength_sessions, strength_sets from authenticated;
create policy strength_sessions_select on strength_sessions for select to authenticated using (user_id = auth.uid());
create policy strength_sets_select on strength_sets for select to authenticated using (user_id = auth.uid());
