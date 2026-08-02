-- Money module, sub-project 1: accounts and net worth.
--
-- Balances are dated snapshots rather than a mutable field per account, because
-- the data actually obtainable is "the balance shown on this date" (a banking
-- app screenshot, a statement) rather than a complete transaction ledger. A
-- pension or mortgage will never have a full ledger available.

create table if not exists money_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  institution text,
  kind text not null check (kind in (
    'current','savings','isa','pension','investment',
    'credit_card','mortgage','loan','property','other')),
  currency text not null default 'GBP',
  opened_date date,
  closed_date date,
  status text not null default 'active' check (status in ('active','closed')),
  notes text,
  created_at timestamptz not null default now()
);

-- Stops a duplicate live account while letting a closed account keep a name
-- that is later reused for a replacement account.
create unique index if not exists money_accounts_live_name
  on money_accounts (user_id, lower(name)) where status = 'active';

create table if not exists money_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'statement'
    check (kind in ('statement','screenshot','csv','other')),
  storage_path text not null,
  file_size_bytes bigint,
  extracted_balance_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists money_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references money_accounts(id) on delete cascade,
  as_of date not null,
  -- numeric, never float: binary floating point cannot represent 0.10, and a
  -- net worth that disagrees with itself is worse than no figure at all.
  balance numeric(14,2) not null,
  source text not null default 'manual'
    check (source in ('manual','import','document','api')),
  -- set null, not cascade: deleting the statement must not delete the balance
  -- that was read from it, only the link back to it.
  document_id uuid references money_documents(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  -- A bank balance on a given date has exactly one true value, so a CSV import
  -- and a screenshot of the same day reconcile to one row with the newest write
  -- winning. This deliberately omits `source`, unlike health_vitals, where a
  -- watch reading and a clinic reading at one instant are two real measurements.
  unique (user_id, account_id, as_of)
);

create index if not exists money_balances_user_date
  on money_balances (user_id, as_of desc);
create index if not exists money_balances_account_date
  on money_balances (account_id, as_of desc);

alter table money_accounts enable row level security;
alter table money_documents enable row level security;
alter table money_balances enable row level security;

-- `for all` covers select/insert/update/delete. 004_health.sql gave
-- health_blood_markers a SELECT policy only, which silently broke its POST
-- route and a JARVIS tool with "new row violates row-level security policy".
drop policy if exists "own money accounts" on money_accounts;
create policy "own money accounts" on money_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own money documents" on money_documents;
create policy "own money documents" on money_documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own money balances" on money_balances;
create policy "own money balances" on money_balances
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
