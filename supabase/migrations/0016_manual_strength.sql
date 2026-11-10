-- Workouts and exercises Vicky adds by hand, next to the ones the COROS watch recorded.
-- Every session and set now says where it came from: 'coros' (the watch job) or 'manual' (typed in the app).
-- The rules, enforced here and not only on the screens:
--   * Signed in users can add, change and delete only their own 'manual' rows. COROS rows stay read only, even to them.
--   * A manual session has no COROS id, so it can never collide with a real one. A COROS session always has one.
--   * Sets are numbered separately for each source, so a manual set never lands on a watch set's place and the
--     watch job can replace its own sets without touching yours.
-- Nothing existing changes: every current row becomes source 'coros'.

alter table strength_sessions add column source text not null default 'coros' check (source in ('coros', 'manual'));
alter table strength_sessions alter column coros_id drop not null;
alter table strength_sessions add constraint strength_sessions_source_id
  check ((source = 'coros' and coros_id is not null) or (source = 'manual' and coros_id is null));

alter table strength_sets add column source text not null default 'coros' check (source in ('coros', 'manual'));
alter table strength_sets drop constraint strength_sets_session_id_position_key;
alter table strength_sets add constraint strength_sets_session_source_position_key unique (session_id, source, position);

-- Write rights come back for signed in users, but Row Level Security limits them to manual rows.
grant insert, update, delete on strength_sessions, strength_sets to authenticated;

create policy strength_sessions_insert_manual on strength_sessions for insert to authenticated
  with check (user_id = auth.uid() and source = 'manual');
create policy strength_sessions_update_manual on strength_sessions for update to authenticated
  using (user_id = auth.uid() and source = 'manual')
  with check (user_id = auth.uid() and source = 'manual');
create policy strength_sessions_delete_manual on strength_sessions for delete to authenticated
  using (user_id = auth.uid() and source = 'manual');

-- A manual set can go on any of your sessions, a watch session included, but only as a manual set.
create policy strength_sets_insert_manual on strength_sets for insert to authenticated
  with check (user_id = auth.uid() and source = 'manual'
    and exists (select 1 from strength_sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy strength_sets_update_manual on strength_sets for update to authenticated
  using (user_id = auth.uid() and source = 'manual')
  with check (user_id = auth.uid() and source = 'manual');
create policy strength_sets_delete_manual on strength_sets for delete to authenticated
  using (user_id = auth.uid() and source = 'manual');
