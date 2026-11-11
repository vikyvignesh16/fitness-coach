-- Fix for 0019. Postgres lets every role run a new function through the shared 'public' grant,
-- so revoking from anon alone did nothing. Take it away from public, then give it back to the roles that need it.
revoke execute on function match_library_chunks(extensions.vector, int, text) from public, anon;
grant execute on function match_library_chunks(extensions.vector, int, text) to authenticated, service_role;
