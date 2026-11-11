-- The coach's library, for retrieval (RAG).
-- Documents are cut into short chunks. Each chunk is stored with its embedding: a list of 1536 numbers that
-- captures its meaning, made by openai/text-embedding-3-small. Similar meanings give close numbers.
-- Only the coach service (service role) writes. You can read your own rows.
-- 'kind' keeps sample material apart from real evidence. Only 'evidence' rows may ever be cited as a health source.

create extension if not exists vector with schema extensions;

create table library_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  source text not null check (char_length(source) between 1 and 120),        -- the document, like 'schema_guide'
  kind text not null check (kind in ('sample', 'evidence')),
  heading text not null default '' check (char_length(heading) <= 200),      -- where in the document this chunk sits
  chunk_index int not null check (chunk_index >= 0),
  body text not null check (char_length(body) between 1 and 2000),
  body_hash text not null check (char_length(body_hash) = 64),               -- sha256, so an unchanged chunk is not embedded again
  embedding extensions.vector(1536) not null,
  embedding_model text not null check (char_length(embedding_model) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (user_id, source, chunk_index)
);
-- No vector index on purpose. At a few hundred rows an exact scan is fast, and exact results are easier to test.
-- An HNSW index becomes worth adding if the library grows past tens of thousands of chunks.

-- Finds the closest chunks to a question. It runs as the caller, so Row Level Security still applies.
create function match_library_chunks(query_embedding extensions.vector(1536), match_count int default 4, only_kind text default null)
returns table (id uuid, source text, kind text, heading text, body text, distance float)
language sql stable security invoker set search_path = public, extensions as $$
  select c.id, c.source, c.kind, c.heading, c.body, (c.embedding <=> query_embedding)::float as distance
  from library_chunks c
  where only_kind is null or c.kind = only_kind
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 10)
$$;

alter table library_chunks enable row level security;
revoke all on library_chunks from anon;
revoke insert, update, truncate on library_chunks from authenticated;
create policy library_chunks_select on library_chunks for select to authenticated using (user_id = auth.uid());
revoke execute on function match_library_chunks from anon;
