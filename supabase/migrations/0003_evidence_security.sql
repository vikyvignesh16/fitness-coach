-- Evidence library, private photo storage, and Row Level Security on every table.

create table evidence_library (
  id text primary key,              -- the id the model must cite
  title text not null,
  claim text not null,
  source_url text,
  year int,
  verified boolean not null default false
);

-- Private bucket. No public URLs. The app uses signed URLs that expire.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do update set public = false;

create policy "own photos read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- RLS: signed in users see only their own rows. The anon role sees nothing.
-- The service role (ingest job, import script) bypasses RLS by design.
do $$
declare t text;
begin
  foreach t in array array[
    'plan_versions','plan_weeks','plan_days','gates','plan_changes','approvals',
    'runs','meals','gym_sessions','gym_sets','checkins'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (user_id = auth.uid())', t || '_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (user_id = auth.uid())', t || '_insert', t);
  end loop;
  -- these can also be changed or removed by their owner (plan tables cannot: see triggers)
  foreach t in array array['meals','gym_sessions','gym_sets','checkins','runs'] loop
    execute format('create policy %I on %I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_update', t);
    execute format('create policy %I on %I for delete to authenticated using (user_id = auth.uid())', t || '_delete', t);
  end loop;
end $$;

-- Evidence is shared reference data: readable when signed in, written only by the service role.
alter table evidence_library enable row level security;
create policy evidence_select on evidence_library for select to authenticated using (true);
