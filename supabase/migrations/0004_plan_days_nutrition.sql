-- Every day in plan v5.1 has a nutrition block. Keep it next to run and gym.
alter table plan_days add column nutrition jsonb;
