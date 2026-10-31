create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime text,
  size_bytes bigint,
  chunk_count int default 0,
  content text,
  created_at timestamptz default now()
);
alter table documents enable row level security;
create policy "own rows" on documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public) values ('documents', 'documents', false);
create policy "own files read" on storage.objects for select using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files write" on storage.objects for insert with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
