-- Money sub-project 5: property P&L.
--
-- Rent and property costs are existing money_transactions tagged with a
-- property, not a parallel income/expense model: they arrive in the same
-- statements, through the same import, and match the same rules. Two places for
-- the same fact would drift.

create table if not exists money_properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- How the user refers to it: 4FLH, 59CH, 85KX, 24HH.
  code text not null,
  label text,
  -- Per property, not global: mortgage interest is deductible for a company but
  -- not for an individual, and a future incorporation must not need a migration.
  ownership text not null default 'personal' check (ownership in ('personal','company')),
  -- Jointly held property splits income and expenses. Reporting 100% of a
  -- 50%-owned property would overstate its profit by double.
  share_percent numeric(5,2) not null default 100 check (share_percent > 0 and share_percent <= 100),
  acquired_date date,
  disposed_date date,
  status text not null default 'active' check (status in ('active','sold')),
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists money_properties_code
  on money_properties (user_id, lower(code));

-- set null, consistent with categories: deleting a property must not delete the
-- financial history of having owned it.
alter table money_transactions
  add column if not exists property_id uuid
  references money_properties(id) on delete set null;

create index if not exists money_transactions_property
  on money_transactions (property_id);

-- How an expense is treated for property purposes. 'interest' is the Section 24
-- case: a real cash cost, but not deductible against rental income for an
-- individual — it drives a 20% tax reducer instead.
alter table money_categories
  add column if not exists property_treatment text
  check (property_treatment in ('rental_income','allowable','interest','capital','non_allowable'));

-- One rule can set both category and property, which works unusually well here
-- because the property codes are distinctive strings.
alter table money_category_rules
  add column if not exists property_id uuid
  references money_properties(id) on delete cascade;

alter table money_properties enable row level security;

drop policy if exists "own money properties" on money_properties;
create policy "own money properties" on money_properties
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
