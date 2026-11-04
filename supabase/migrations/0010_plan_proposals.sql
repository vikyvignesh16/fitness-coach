-- A new plan from ChatGPT waits here as a draft until Vicky approves it.
-- It is NOT a plan version, because the web app, the calendar link and the watch job all read the newest
-- plan_versions row. Approving runs adopt_plan_proposal, which stores the new version in one step.

-- The coaching notes (before, during, after ...) are shown in the web app only. Plan v5.1 has none.
alter table plan_days add column coaching_notes jsonb;

create table plan_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  version text not null,                                   -- the version name inside the plan, e.g. 5.7
  source jsonb not null,                                   -- the full plan, exactly as ChatGPT wrote it
  reason text not null,
  checks jsonb not null,                                   -- {"errors": [...], "warnings": [...]} from coach/check_proposal.py
  base_version_id uuid references plan_versions(id),       -- the plan it was checked against
  status text not null default 'draft' check (status in ('draft', 'adopted', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  adopted_version_id uuid references plan_versions(id),
  unique (user_id, version)
);

-- Signed in users can read their own drafts. Drafts are written by the check job (service role)
-- and changed only by adopt_plan_proposal, so there is no insert or update policy.
alter table plan_proposals enable row level security;
revoke all on plan_proposals from anon;
create policy plan_proposals_select on plan_proposals for select to authenticated using (user_id = auth.uid());

-- Approve a draft. Everything happens in one transaction, so a failure leaves nothing behind
-- (plan versions cannot be deleted, so a half finished import would be stuck for good).
-- It never changes an existing plan version. It cancels watch approvals that were never sent
-- for days whose workout changed, so Vicky approves the workout she can now see.
create function adopt_plan_proposal(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  prop public.plan_proposals%rowtype;
  base_id uuid;
  new_id uuid;
begin
  if me is null then
    raise exception 'Sign in first.';
  end if;

  select * into prop from public.plan_proposals where id = p_id and user_id = me for update;
  if not found then
    raise exception 'That draft was not found.';
  end if;
  if prop.status <> 'draft' then
    raise exception 'That draft has already been decided (%).', prop.status;
  end if;
  if jsonb_array_length(coalesce(prop.checks->'errors', '[]'::jsonb)) > 0 then
    raise exception 'That draft has problems that must be fixed first.';
  end if;

  select id into base_id from public.plan_versions where user_id = me order by created_at desc limit 1;

  insert into public.plan_versions (user_id, version, source)
  values (me, prop.version, prop.source)
  returning id into new_id;

  insert into public.plan_weeks (plan_version_id, user_id, week, start_date, phase, total_km)
  select new_id, me, (w->>'week')::int, (w->>'start_date')::date, w->>'phase', (w->>'total_km')::numeric
  from jsonb_array_elements(prop.source->'weeks') w;

  insert into public.plan_days (plan_version_id, user_id, date, week, run, gym, nutrition, coaching_notes)
  select new_id, me, (d->>'date')::date, (w->>'week')::int, d->'run', d->'gym', d->'nutrition', d->'coaching_notes'
  from jsonb_array_elements(prop.source->'weeks') w, jsonb_array_elements(w->'days') d;

  insert into public.gates (plan_version_id, user_id, gate_id, definition)
  select new_id, me, g->>'id', g
  from jsonb_array_elements(prop.source->'gates') g;

  -- Watch approvals that were never sent and never started, for days whose watch workout is not the same any more.
  -- What the watch job sends is the workout steps and its name (ingest/watch_course.to_course). Notes are never sent.
  if base_id is not null then
    delete from public.approvals a
    where a.user_id = me and a.kind = 'watch_workout'
      and a.sent_at is null and a.send_started_at is null
      and exists (
        select 1
        from public.plan_days old_d
        join public.plan_days new_d on new_d.date = old_d.date and new_d.plan_version_id = new_id
        where old_d.plan_version_id = base_id and old_d.date = a.subject_date
          and (old_d.run #> '{coros_workout,steps}', old_d.run #> '{coros_workout,name}')
              is distinct from
              (new_d.run #> '{coros_workout,steps}', new_d.run #> '{coros_workout,name}')
      );
  end if;

  insert into public.plan_changes (user_id, from_version_id, to_version_id, reason, violations)
  values (me, base_id, new_id, prop.reason, coalesce(prop.checks->'warnings', '[]'::jsonb));

  update public.plan_proposals
  set status = 'adopted', decided_at = now(), adopted_version_id = new_id
  where id = p_id;

  return new_id;
end $$;

revoke all on function adopt_plan_proposal(uuid) from public, anon;
grant execute on function adopt_plan_proposal(uuid) to authenticated;
