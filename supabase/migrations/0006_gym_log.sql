-- Gym log: tick for each set, timed holds, one session per day, and sensible limits.
-- Both tables are empty when this runs, so nothing is lost.

alter table gym_sessions add column finished_at timestamptz;
alter table gym_sessions add constraint gym_sessions_one_per_day unique (user_id, date);

alter table gym_sets add column done boolean not null default false;
alter table gym_sets add column seconds int;               -- for timed holds like "60 sec"
alter table gym_sets add constraint gym_sets_one_row_per_set unique (session_id, exercise, set_no);

-- Limits in the database too, so a bug in the app cannot save a nonsense number.
alter table gym_sets add constraint gym_sets_set_no_range check (set_no between 1 and 20);
alter table gym_sets add constraint gym_sets_reps_range check (reps is null or reps between 0 and 100);
alter table gym_sets add constraint gym_sets_load_range check (load_kg is null or load_kg between 0 and 500);
alter table gym_sets add constraint gym_sets_seconds_range check (seconds is null or seconds between 0 and 7200);
alter table gym_sets add constraint gym_sets_rir_range check (rir is null or rir between 0 and 10);
