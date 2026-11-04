-- A private calendar link that Google Calendar can read without logging in.
-- The link holds a long random token. Only a hash of it is stored, so a database leak does not leak the link.

create table calendar_feeds (
  user_id uuid primary key default auth.uid() references auth.users(id),   -- one link per user
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),           -- sha256 of the token, hex
  created_at timestamptz not null default now()
);
create unique index calendar_feeds_token_hash on calendar_feeds (token_hash);

alter table calendar_feeds enable row level security;
revoke all on calendar_feeds from anon;
create policy calendar_feeds_select on calendar_feeds for select to authenticated using (user_id = auth.uid());
create policy calendar_feeds_insert on calendar_feeds for insert to authenticated with check (user_id = auth.uid());
create policy calendar_feeds_update on calendar_feeds for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The one door for the feed. Anyone holding the token may call it, and it returns only:
--   the plan version name, each planned run's type, distance, duration, pace and steps, and the ankle gate results.
-- It never returns notes (they mention ankle symptoms), weights, photos, pain, meals or anything else.
-- A wrong token returns null.
create function calendar_feed(feed_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with owner as (
    select user_id from public.calendar_feeds
    where token_hash = encode(sha256(convert_to(feed_token, 'utf8')), 'hex')
  ), latest as (
    select pv.id, pv.version from public.plan_versions pv join owner o on o.user_id = pv.user_id
    order by pv.created_at desc limit 1
  )
  select jsonb_build_object(
    'version', (select version from latest),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', d.date,
        'week', d.week,
        'run', jsonb_build_object(
          'type', d.run->'type',
          'distance_km', d.run->'distance_km',
          'duration_min', d.run->'duration_min',
          'pace_or_effort', d.run->'pace_or_effort',
          'steps', d.run->'steps'
        )
      ) order by d.date)
      from public.plan_days d join latest l on l.id = d.plan_version_id
      where d.run is not null
    ), '[]'::jsonb),
    'gates', coalesce((
      select jsonb_agg(jsonb_build_object('passed', a.passed, 'created_at', a.created_at))
      from public.approvals a join owner o on o.user_id = a.user_id
      where a.kind = 'gate' and a.gate_id = 'ankle_return_w2'
    ), '[]'::jsonb)
  )
  where exists (select 1 from owner)
$$;

revoke all on function calendar_feed(text) from public;
grant execute on function calendar_feed(text) to anon, authenticated;
