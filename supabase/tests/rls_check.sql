-- Run after applying migrations. Both queries must return zero rows.

-- 1. Any table in public without RLS turned on.
select tablename from pg_tables
where schemaname = 'public' and not rowsecurity;

-- 2. Anything the anon role can read.
set local role anon;
select 'plan_versions' as t, count(*) from plan_versions having count(*) > 0
union all select 'runs', count(*) from runs having count(*) > 0
union all select 'meals', count(*) from meals having count(*) > 0
union all select 'checkins', count(*) from checkins having count(*) > 0;
reset role;

-- 3. The calendar feed (migration 0009). Both of these must return zero rows.
--    The anon role must not read the link table, and a wrong token must give nothing.
set local role anon;
select 'calendar_feeds' as t, count(*) from calendar_feeds having count(*) > 0;
select 'wrong token' as t where calendar_feed('not-a-real-token') is not null;
reset role;

-- 4. Draft plans (migration 0010). Both must return zero rows.
--    The anon role must not read drafts, and must not be able to adopt one.
set local role anon;
select 'plan_proposals' as t, count(*) from plan_proposals having count(*) > 0;
reset role;
select 'anon can adopt' as t where has_function_privilege('anon', 'adopt_plan_proposal(uuid)', 'execute');
