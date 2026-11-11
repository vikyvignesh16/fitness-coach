-- Memory for the coach chat.
-- Short term: the back and forth of a conversation (chat_threads and chat_messages).
-- Long term: short facts Vicky asked the coach to remember (coach_memory).
-- Only the coach service (service role) writes. You can read your own rows, and delete them.

create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  title text check (char_length(title) <= 80),
  created_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,   -- deleting a thread deletes its messages
  user_id uuid not null default auth.uid() references auth.users(id),
  role text not null check (role in ('user', 'coach')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index chat_messages_thread_time on chat_messages (thread_id, created_at);

create table coach_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  fact text not null check (char_length(fact) between 1 and 200),
  source text not null default 'chat' check (source in ('chat', 'manual')),
  created_at timestamptz not null default now()
);
-- The same fact cannot be saved twice, whatever the capital letters.
create unique index coach_memory_no_duplicates on coach_memory (user_id, lower(fact));

alter table chat_threads enable row level security;
alter table chat_messages enable row level security;
alter table coach_memory enable row level security;
revoke all on chat_threads, chat_messages, coach_memory from anon;
revoke insert, update, truncate on chat_threads, chat_messages, coach_memory from authenticated;
create policy chat_threads_select on chat_threads for select to authenticated using (user_id = auth.uid());
create policy chat_messages_select on chat_messages for select to authenticated using (user_id = auth.uid());
create policy coach_memory_select on coach_memory for select to authenticated using (user_id = auth.uid());
create policy chat_threads_delete on chat_threads for delete to authenticated using (user_id = auth.uid());
create policy chat_messages_delete on chat_messages for delete to authenticated using (user_id = auth.uid());
create policy coach_memory_delete on coach_memory for delete to authenticated using (user_id = auth.uid());
