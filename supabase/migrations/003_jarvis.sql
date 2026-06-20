create table if not exists jarvis_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('fact', 'preference', 'context')),
  content text not null,
  created_at timestamptz not null default now()
);

create index jarvis_memories_user_id_idx on jarvis_memories(user_id);

alter table jarvis_memories enable row level security;

create policy "Users can manage their own memories"
  on jarvis_memories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
