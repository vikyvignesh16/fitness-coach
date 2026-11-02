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
