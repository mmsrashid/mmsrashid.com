-- Money sub-project 2: transactions and spending analysis.

create table if not exists money_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- 'transfer' exists so a move between the user's own accounts can be excluded
  -- from both spending and income. Counted naively it inflates both.
  kind text not null check (kind in ('spending','income','transfer')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists money_categories_name
  on money_categories (user_id, lower(name));

create table if not exists money_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references money_accounts(id) on delete cascade,
  txn_date date not null,
  description text not null,
  merchant text,
  -- Negative is money out, positive is money in. Normalised at the parser
  -- boundary so nothing downstream has to guess.
  amount numeric(14,2) not null,
  -- set null, not cascade: the spending happened whatever you later decide to
  -- call it, so a bookkeeping change must not delete history.
  category_id uuid references money_categories(id) on delete set null,
  category_source text check (category_source in ('rule','ai','manual')),
  document_id uuid references money_documents(id) on delete set null,
  external_id text,
  dedupe_key text not null,
  notes text,
  created_at timestamptz not null default now(),
  -- The key includes an occurrence index, so two identical same-day purchases
  -- both survive while a re-uploaded or overlapping statement still collapses.
  unique (user_id, dedupe_key)
);

create index if not exists money_transactions_user_date
  on money_transactions (user_id, txn_date desc);
create index if not exists money_transactions_account_date
  on money_transactions (account_id, txn_date desc);
create index if not exists money_transactions_category
  on money_transactions (category_id);

create table if not exists money_category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_type text not null check (match_type in ('contains','exact','regex')),
  pattern text not null,
  -- cascade, unlike transactions: a rule pointing at a deleted category can
  -- never fire and is only debris.
  category_id uuid not null references money_categories(id) on delete cascade,
  priority int not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists money_category_rules_user_priority
  on money_category_rules (user_id, priority);

alter table money_categories enable row level security;
alter table money_transactions enable row level security;
alter table money_category_rules enable row level security;

-- `for all` covers select/insert/update/delete. 004_health.sql gave
-- health_blood_markers a SELECT policy only, which silently broke its POST
-- route and a JARVIS tool with "new row violates row-level security policy".
drop policy if exists "own money categories" on money_categories;
create policy "own money categories" on money_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own money transactions" on money_transactions;
create policy "own money transactions" on money_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own money rules" on money_category_rules;
create policy "own money rules" on money_category_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
