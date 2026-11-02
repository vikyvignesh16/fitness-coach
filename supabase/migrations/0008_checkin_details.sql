-- Weekly check in: height, the answers the pain stop rules need, the rule's result, and photo paths.
-- The checkins table is empty when this runs, so nothing is lost.

alter table checkins add column height_cm numeric;

-- The answers the pain stop rules use (see coach/safety/health_rules.py).
alter table checkins add column pain_repeated boolean not null default false;      -- pain of 3 or more more than once
alter table checkins add column pain_lasted_hours numeric not null default 0;      -- how long pain of 3 or more lasted
alter table checkins add column pain_worse_next_morning boolean not null default false;

-- The result, worked out on the server and saved so other parts of the app can read it.
alter table checkins add column pain_stop boolean not null default false;
alter table checkins add column pain_stop_message text;

-- Where the photos are in the private photos bucket. Paths only, never web addresses.
alter table checkins add column photo_front text;
alter table checkins add column photo_side text;
alter table checkins add column photo_back text;

alter table checkins add constraint checkins_weight_range check (morning_weight_kg is null or morning_weight_kg between 30 and 250);
alter table checkins add constraint checkins_height_range check (height_cm is null or height_cm between 100 and 250);
alter table checkins add constraint checkins_pain_hours_range check (pain_lasted_hours between 0 and 336);
alter table checkins add constraint checkins_pain_flags_known
  check (pain_flags <@ array['swelling', 'giving_way', 'gait_change', 'cannot_bear_weight']);

-- A photo path must sit in this user's own folder, in the weekly check in folder, and be a jpeg.
-- (The storage rules already limit each user to their own folder. This stops a wrong path being saved.)
alter table checkins add constraint checkins_photo_paths_shape check (
  (photo_front is null or photo_front ~ '^[0-9a-f-]{36}/checkins/[0-9]{4}-[0-9]{2}-[0-9]{2}/front\.jpg$') and
  (photo_side  is null or photo_side  ~ '^[0-9a-f-]{36}/checkins/[0-9]{4}-[0-9]{2}-[0-9]{2}/side\.jpg$') and
  (photo_back  is null or photo_back  ~ '^[0-9a-f-]{36}/checkins/[0-9]{4}-[0-9]{2}-[0-9]{2}/back\.jpg$')
);
