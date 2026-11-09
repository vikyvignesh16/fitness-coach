-- Watch health numbers for the Insights dashboard.
-- COROS keeps its own dated history for sleep, HRV, resting heart rate, stress, daily activity and training load,
-- so the job can read those days again and overwrite them safely: they go straight into health_daily.
-- Recovery status is different. COROS only says what it is right now, so we save it every pull in recovery_snapshots.
-- The fitness overview (VO2max, race predictions) is also today only, so its last value of the day sits in health_daily.
--
-- Every number may be empty. A night with no sleep recorded, or a day the watch was off, is stored as empty,
-- never as zero. (COROS writes "Sleep Score: 0" for a missing night, so a sleep score of 0 is rejected here.)
-- A "day" is the Europe/Paris calendar date. Sleep belongs to the wake-up day.
-- Only the COROS job (service role) writes. Signed in users can read their own rows.

create table health_daily (
  user_id uuid not null default auth.uid() references auth.users(id),
  day date not null,

  -- Sleep
  sleep_score int check (sleep_score between 1 and 100),
  sleep_asleep_min int check (sleep_asleep_min between 0 and 1440),     -- main sleep, time asleep
  sleep_total_min int check (sleep_total_min between 0 and 1440),       -- all sleep that day, naps included
  sleep_period_min int check (sleep_period_min between 0 and 1440),     -- main sleep period, awake time included
  sleep_deep_min int check (sleep_deep_min between 0 and 1440),
  sleep_light_min int check (sleep_light_min between 0 and 1440),
  sleep_rem_min int check (sleep_rem_min between 0 and 1440),
  sleep_awake_min int check (sleep_awake_min between 0 and 1440),
  sleep_nap_min int check (sleep_nap_min between 0 and 1440),
  sleep_start timestamptz,
  sleep_end timestamptz,
  sleep_hr_avg int check (sleep_hr_avg between 20 and 250),
  sleep_hr_min int check (sleep_hr_min between 20 and 250),
  sleep_hr_max int check (sleep_hr_max between 20 and 250),

  -- Heart rate variability (the night that ended this morning). The normal range and baseline differ from day to day.
  hrv_avg_ms int check (hrv_avg_ms between 1 and 500),
  hrv_label text check (char_length(hrv_label) <= 40),                   -- COROS words, like Low, Below normal, Normal
  hrv_normal_low_ms int check (hrv_normal_low_ms between 1 and 500),
  hrv_normal_high_ms int check (hrv_normal_high_ms between 1 and 500),
  hrv_baseline_ms int check (hrv_baseline_ms between 1 and 500),

  -- Heart rate and stress
  resting_hr int check (resting_hr between 20 and 150),
  hr_avg int check (hr_avg between 20 and 250),                          -- all day average, not resting
  hr_min int check (hr_min between 20 and 250),
  hr_max int check (hr_max between 20 and 250),
  stress_avg int check (stress_avg between 0 and 100),

  -- Daily activity
  steps int check (steps between 0 and 200000),
  calories_kcal int check (calories_kcal between 0 and 20000),
  exercise_min int check (exercise_min between 0 and 1440),

  -- Training load, COROS's own numbers (it keeps about 30 days of history)
  load_short int check (load_short between 0 and 2000),
  load_long int check (load_long between 0 and 2000),
  load_ratio numeric(4, 2) check (load_ratio between 0 and 10),
  load_label text check (char_length(load_label) <= 40),                 -- COROS words, like Performance, Maintaining

  -- Recovery status, worked out from that day's recovery_snapshots
  recovery_avg numeric(4, 1) check (recovery_avg between 0 and 100),
  recovery_min int check (recovery_min between 0 and 100),
  recovery_max int check (recovery_max between 0 and 100),
  recovery_last int check (recovery_last between 0 and 100),

  -- Fitness overview, last value seen that day. Times are in seconds, pace is seconds per km.
  vo2max numeric(4, 1) check (vo2max between 10 and 100),
  running_level numeric(5, 1) check (running_level between 0 and 200),
  threshold_pace_s int check (threshold_pace_s between 120 and 900),
  pred_5k_s int check (pred_5k_s > 0),
  pred_10k_s int check (pred_10k_s > 0),
  pred_half_s int check (pred_half_s > 0),
  pred_marathon_s int check (pred_marathon_s > 0),

  complete boolean not null default false,                               -- true once the day is over and the last pull is in
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  primary key (user_id, day),
  check (hrv_normal_low_ms is null or hrv_normal_high_ms is null or hrv_normal_low_ms <= hrv_normal_high_ms),
  check (hr_min is null or hr_max is null or hr_min <= hr_max),
  check (sleep_hr_min is null or sleep_hr_max is null or sleep_hr_min <= sleep_hr_max),
  check (recovery_min is null or recovery_max is null or recovery_min <= recovery_max),
  check (sleep_start is null or sleep_end is null or sleep_start < sleep_end)
);

-- One row each time the job pulls the current recovery status (every 3 hours). History starts the day the job starts.
create table recovery_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  taken_at timestamptz not null,
  day date not null,                                                     -- Paris date of taken_at
  recovery_pct int not null check (recovery_pct between 0 and 100),
  level text check (char_length(level) <= 40),                           -- COROS word, like Fresh
  full_recovery_h int check (full_recovery_h between 0 and 720),         -- estimated hours until fully recovered
  created_at timestamptz not null default now(),
  unique (user_id, taken_at)
);
create index recovery_snapshots_day on recovery_snapshots (user_id, day);

-- Row Level Security: read your own rows, no insert, update or delete for signed in users. The job uses the service role.
alter table health_daily enable row level security;
alter table recovery_snapshots enable row level security;
revoke all on health_daily, recovery_snapshots from anon;
revoke insert, update, delete, truncate on health_daily, recovery_snapshots from authenticated;
create policy health_daily_select on health_daily for select to authenticated using (user_id = auth.uid());
create policy recovery_snapshots_select on recovery_snapshots for select to authenticated using (user_id = auth.uid());
