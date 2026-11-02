-- COROS login tokens. Every refresh replaces the refresh token, so the ingest job must be able to save the new one.
-- Row Level Security is on with NO policies and all grants removed: only the service role can read or write.
create table coros_tokens (
  id int primary key default 1 check (id = 1),   -- one row, one user
  mcp_url text not null,
  client_id text not null,                       -- from COROS dynamic registration, not a secret
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table coros_tokens enable row level security;
revoke all on coros_tokens from anon, authenticated;
