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

-- 5. Watch health tables (migration 0011). All of these must return zero rows.
--    The anon role must not read either table, and a signed in user must not be able to change them.
set local role anon;
select 'health_daily' as t, count(*) from health_daily having count(*) > 0
union all select 'recovery_snapshots', count(*) from recovery_snapshots having count(*) > 0;
reset role;
select 'authenticated can write ' || t as problem
from (values ('health_daily'), ('recovery_snapshots')) as x(t), unnest(array['insert', 'update', 'delete']) as p
where has_table_privilege('authenticated', x.t, p);

-- 6. Strength sessions from COROS (migration 0013). All of these must return zero rows.
set local role anon;
select 'strength_sessions' as t, count(*) from strength_sessions having count(*) > 0
union all select 'strength_sets', count(*) from strength_sets having count(*) > 0;
reset role;
select 'authenticated can write ' || t as problem
from (values ('strength_sessions'), ('strength_sets')) as x(t), unnest(array['insert', 'update', 'delete']) as p
where has_table_privilege('authenticated', x.t, p);

-- 7. Manual strength rows (migration 0016). Must return zero rows.
--    The anon role must not write either table. (What a signed in user may and may not change is tested by hand
--    inside a transaction that is rolled back: only rows marked 'manual', only their own.)
select 'anon can write ' || t as problem
from (values ('strength_sessions'), ('strength_sets')) as x(t), unnest(array['insert', 'update', 'delete']) as p
where has_table_privilege('anon', x.t, p);

-- 8. Model call log and cap (migration 0017). All of these must return zero rows.
set local role anon;
select 'llm_calls' as t, count(*) from llm_calls having count(*) > 0
union all select 'coach_settings', count(*) from coach_settings having count(*) > 0;
reset role;
select 'authenticated can write llm_calls' as problem
from unnest(array['insert', 'update', 'delete']) as p where has_table_privilege('authenticated', 'llm_calls', p);
select 'authenticated can ' || p || ' coach_settings' as problem
from unnest(array['insert', 'delete']) as p where has_table_privilege('authenticated', 'coach_settings', p);

-- 9. Chat memory (migration 0018). All of these must return zero rows.
set local role anon;
select 'chat_threads' as t, count(*) from chat_threads having count(*) > 0
union all select 'chat_messages', count(*) from chat_messages having count(*) > 0
union all select 'coach_memory', count(*) from coach_memory having count(*) > 0;
reset role;
select 'authenticated can ' || p || ' ' || t as problem
from (values ('chat_threads'), ('chat_messages'), ('coach_memory')) as x(t), unnest(array['insert', 'update']) as p
where has_table_privilege('authenticated', x.t, p);
select 'anon can touch ' || t as problem
from (values ('chat_threads'), ('chat_messages'), ('coach_memory')) as x(t) where has_table_privilege('anon', x.t, 'select');

-- 10. Library chunks (migration 0019). All of these must return zero rows.
set local role anon;
select 'library_chunks' as t, count(*) from library_chunks having count(*) > 0;
reset role;
select 'authenticated can ' || p as problem
from unnest(array['insert', 'update']) as p where has_table_privilege('authenticated', 'library_chunks', p);
select 'anon can touch library_chunks' as problem where has_table_privilege('anon', 'library_chunks', 'select');
select 'anon can run match_library_chunks' as problem
where has_function_privilege('anon', 'match_library_chunks(extensions.vector, int, text)', 'execute');
