-- What COROS knows about each run beyond the list: training load, training effect, the effort word you pick,
-- the note you type, and a few running form numbers. Filled by ingest/coros_run_details.py from getActivityDetail.
-- All columns are empty until a run's details have been read, and a field COROS does not have stays empty.
-- Elevation gain goes in the existing runs.elevation_m column.
-- Your note is private text. It stays in your database, readable only by you, and never goes to COROS.

alter table runs add column training_load int check (training_load between 0 and 2000);
alter table runs add column aerobic_te numeric(3, 1) check (aerobic_te between 0 and 10);
alter table runs add column anaerobic_te numeric(3, 1) check (anaerobic_te between 0 and 10);
alter table runs add column training_focus text check (char_length(training_focus) <= 60);   -- COROS word, like Base
alter table runs add column performance text check (char_length(performance) <= 60);        -- COROS word, like Below Average
alter table runs add column perceived_effort text check (char_length(perceived_effort) <= 60); -- the word you pick, like Very Easy
alter table runs add column workout_note text check (char_length(workout_note) <= 5000);
alter table runs add column cadence_spm int check (cadence_spm between 0 and 300);
alter table runs add column stride_length_m numeric(3, 2) check (stride_length_m between 0 and 4);
alter table runs add column power_w int check (power_w between 0 and 2000);
alter table runs add column elev_loss_m int check (elev_loss_m between 0 and 10000);
alter table runs add column best_km_pace_s int check (best_km_pace_s between 60 and 3600);   -- fastest single kilometre, seconds per km
alter table runs add column detail_fetched_at timestamptz;                                   -- when the details were last read
