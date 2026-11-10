-- The hand ticked gym log is gone from the app. Gym sessions now come from the COROS watch (strength_sessions and
-- strength_sets, migration 0013). Vicky decided on 2026-11-10 that the old tables are not required.
-- They held 1 test session and 1 set. Nothing else refers to them (checked: no views, no functions, and the only
-- foreign key is from gym_sets to gym_sessions, so gym_sets goes first).
-- Dropping a table cannot be undone.
drop table gym_sets;
drop table gym_sessions;
