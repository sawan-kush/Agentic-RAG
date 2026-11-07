-- Chat history tables. Run this in Supabase -> SQL Editor.
-- Safe to run more than once, and safe on top of tables you already have: it only creates what is
-- missing, relaxes what blocked saving, and finally removes the empty chats left behind by failed saves.

-- One row per chat (one entry in the sidebar) ...
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ... and one row per message in it. `id` increases with every insert, which is what keeps messages in order.
create table if not exists messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user', 'ai')),
  text text not null,
  sources jsonb default '[]'::jsonb,
  trace jsonb default '[]'::jsonb,
  verified boolean,
  created_at timestamptz not null default now()
);

-- If the tables already existed (older script, hand-made), make sure every column the app uses is there ...
alter table conversations add column if not exists title text not null default 'New chat';
alter table conversations add column if not exists updated_at timestamptz not null default now();
alter table messages add column if not exists sources jsonb default '[]'::jsonb;
alter table messages add column if not exists trace jsonb default '[]'::jsonb;
alter table messages add column if not exists verified boolean;

-- ... and make sure these three can never block a save again
-- (a NOT NULL on `sources` is what produced: null value in column "sources" ... violates not-null constraint).
alter table messages alter column sources drop not null;
alter table messages alter column trace drop not null;
alter table messages alter column verified drop not null;

-- Fast sidebar list (newest first) and fast "open this chat".
create index if not exists conversations_user_updated_idx on conversations (user_id, updated_at desc);
create index if not exists messages_conversation_idx on messages (conversation_id, id);

-- Privacy: nobody can read another person's chats straight from Supabase with the public (anon) key.
-- The backend uses the service-role key, which bypasses these rules, so the app itself is unaffected.
alter table conversations enable row level security;
alter table messages enable row level security;
drop policy if exists "own rows" on conversations;
create policy "own rows" on conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own rows" on messages;
create policy "own rows" on messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Clean-up: delete chats that have no messages at all (the empty sidebar entries failed saves left behind).
-- A chat only gets created together with its first messages, so nothing real is lost here.
delete from conversations c
where not exists (select 1 from messages m where m.conversation_id = c.id);