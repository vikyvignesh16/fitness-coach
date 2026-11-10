-- Every model call the coach makes is logged here, so the monthly spending cap can add them up.
-- Only counts and costs are stored. Never the question, the answer, a photo or a key.
-- The coach service (service role) writes. Signed in users can read their own rows.

create table llm_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  at timestamptz not null default now(),
  purpose text not null check (char_length(purpose) between 1 and 60),      -- like first_call, daily_review, chat
  model text not null check (char_length(model) between 1 and 100),         -- the OpenRouter name, like openai/gpt-6-luna
  input_tokens int check (input_tokens between 0 and 10000000),
  output_tokens int check (output_tokens between 0 and 10000000),
  cost_usd numeric(10, 6) not null default 0 check (cost_usd between 0 and 1000),
  ok boolean not null,
  error text check (char_length(error) <= 80)                               -- a short name like cap_reached or timeout, never the full text
);
create index llm_calls_user_at on llm_calls (user_id, at);

-- The monthly cap. One row per user. A missing row means the default of 10 dollars (the coach code applies it).
create table coach_settings (
  user_id uuid primary key default auth.uid() references auth.users(id),
  monthly_cap_usd numeric(8, 2) not null default 10 check (monthly_cap_usd between 0 and 1000),
  updated_at timestamptz not null default now()
);

alter table llm_calls enable row level security;
alter table coach_settings enable row level security;
revoke all on llm_calls, coach_settings from anon;
revoke insert, update, delete, truncate on llm_calls from authenticated;
-- You may raise or lower your own cap. You may not delete the row or touch anyone else's.
revoke insert, delete, truncate on coach_settings from authenticated;
create policy llm_calls_select on llm_calls for select to authenticated using (user_id = auth.uid());
create policy coach_settings_select on coach_settings for select to authenticated using (user_id = auth.uid());
create policy coach_settings_update on coach_settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The one existing user starts with the default cap.
insert into coach_settings (user_id) select id from auth.users;
