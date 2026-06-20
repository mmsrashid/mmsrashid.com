create table public.kanban_cards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'todo' check (status in ('idea', 'todo', 'in_progress', 'done')),
  position integer not null default 0,
  tags text[] not null default '{}',
  due_date date,
  created_at timestamptz not null default now()
);

alter table public.kanban_cards enable row level security;

-- Only authenticated users can read/write kanban cards
create policy "Auth users manage kanban" on public.kanban_cards
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
