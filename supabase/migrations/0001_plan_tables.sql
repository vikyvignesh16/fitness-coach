-- Plan storage. v5.1 is stored as is and can never be changed or deleted.
-- Every table has a user_id so Row Level Security can say "only my rows".

create table plan_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  version text not null,
  source jsonb not null,            -- the full JSON, untouched
  created_at timestamptz not null default now(),
  unique (user_id, version)
);

create table plan_weeks (
  plan_version_id uuid not null references plan_versions(id),
  user_id uuid not null default auth.uid() references auth.users(id),
  week int not null,
  start_date date not null,
  phase text not null,
  total_km numeric not null,
  primary key (plan_version_id, week)
);

create table plan_days (
  plan_version_id uuid not null references plan_versions(id),
  user_id uuid not null default auth.uid() references auth.users(id),
  date date not null,
  week int not null,
  run jsonb,
  gym jsonb,
  primary key (plan_version_id, date)
);

create table gates (
  plan_version_id uuid not null references plan_versions(id),
  user_id uuid not null default auth.uid() references auth.users(id),
  gate_id text not null,
  definition jsonb not null,        -- exactly as written in the plan
  primary key (plan_version_id, gate_id)
);

-- A new model plan becomes a new plan_versions row. This table records why.
create table plan_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  from_version_id uuid references plan_versions(id),
  to_version_id uuid not null references plan_versions(id),
  reason text not null,
  violations jsonb,                 -- safety violations that triggered a revision, if any
  created_at timestamptz not null default now()
);

-- Vicky's decisions: gate results, plan approvals, watch writes.
create table approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  kind text not null check (kind in ('gate', 'plan', 'watch_workout')),
  plan_version_id uuid references plan_versions(id),
  gate_id text,
  subject_date date,                -- for watch_workout: the planned day
  passed boolean,                   -- for gates
  checks jsonb,                     -- result of each check, with its own date
  note text,
  decided_on date not null default current_date,
  created_at timestamptz not null default now()
);

-- Protect the plan of record: no edits, no deletes.
create function block_plan_changes() returns trigger language plpgsql as $$
begin
  raise exception 'Plan versions are read only. Store a new version instead.';
end $$;

create trigger plan_versions_readonly
  before update or delete on plan_versions
  for each row execute function block_plan_changes();
create trigger plan_weeks_readonly
  before update or delete on plan_weeks
  for each row execute function block_plan_changes();
create trigger plan_days_readonly
  before update or delete on plan_days
  for each row execute function block_plan_changes();
create trigger gates_readonly
  before update or delete on gates
  for each row execute function block_plan_changes();
