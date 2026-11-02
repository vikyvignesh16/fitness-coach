-- Sending approved runs to the COROS watch.
-- The web app writes an approval. The watch job (service role) sends it and records the result.

alter table approvals add column sent_at timestamptz;          -- when the workout reached COROS
alter table approvals add column coros_ref text;               -- COROS's id for it (idInPlan), to find it later
alter table approvals add column send_error text;              -- why the last attempt failed, if it did
alter table approvals add column send_started_at timestamptz;  -- set just before sending, to spot a crash

-- A watch approval always names the day it is for.
alter table approvals add constraint approvals_watch_has_date
  check (kind <> 'watch_workout' or subject_date is not null);

-- One approval per day. COROS has no delete tool, so a duplicate would have to be removed by hand in the app.
create unique index approvals_one_watch_workout_per_day
  on approvals (user_id, subject_date) where kind = 'watch_workout';

-- Only the watch job may say a workout was sent. A signed in user (the web app) cannot set these fields,
-- so "on your watch" always means the job really sent it.
create function approvals_clear_send_fields() returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' then
    new.sent_at := null;
    new.coros_ref := null;
    new.send_error := null;
    new.send_started_at := null;
  end if;
  return new;
end $$;

create trigger approvals_clear_send_fields
  before insert on approvals
  for each row execute function approvals_clear_send_fields();
