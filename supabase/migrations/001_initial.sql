-- Projects (portfolio items)
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  tags text[] not null default '{}',
  github_url text,
  live_url text,
  created_at timestamptz not null default now()
);

-- Blog posts
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text not null default '',
  content_json jsonb not null default '{}',
  cover_image_url text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

-- Visitor messages (from public chat widget)
create table public.visitor_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS: all tables private by default
alter table public.projects enable row level security;
alter table public.posts enable row level security;
alter table public.visitor_messages enable row level security;

-- Public read access for projects and published posts
create policy "Public can read projects" on public.projects
  for select using (true);

create policy "Public can read published posts" on public.posts
  for select using (published = true);

-- visitor_messages: public insert only
create policy "Public can submit visitor messages" on public.visitor_messages
  for insert with check (true);
