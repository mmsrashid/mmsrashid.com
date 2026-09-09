-- Accruals basis for rental income.
--
-- Rent on this portfolio is sometimes paid three or six months in advance, and
-- an advance straddles 5 April. On the cash basis the whole payment lands in
-- the year it arrived, overstating that year and understating the next. These
-- columns record the period a payment actually covers so it can be apportioned
-- across the months it pays for.
--
-- Both nullable: a payment with no covered period keeps its existing cash
-- treatment, so this migration changes no figure until a period is recorded.

alter table money_transactions
  add column if not exists covers_from date,
  add column if not exists covers_to date;

-- Either both dates or neither. One alone cannot describe a period, and a
-- half-filled pair would silently fall back to cash treatment while looking set.
alter table money_transactions
  drop constraint if exists money_transactions_covers_both;
alter table money_transactions
  add constraint money_transactions_covers_both
  check ((covers_from is null) = (covers_to is null));

-- Forwards only. A backwards period is caught in code too, but bad data should
-- not get in to begin with.
alter table money_transactions
  drop constraint if exists money_transactions_covers_order;
alter table money_transactions
  add constraint money_transactions_covers_order
  check (covers_to is null or covers_from is null or covers_to >= covers_from);

-- The property P&L reads a wider window than the reporting period so an advance
-- paid before it can still be apportioned into it.
create index if not exists money_transactions_covers_idx
  on money_transactions (property_id, covers_from, covers_to);

comment on column money_transactions.covers_from is
  'First day of the first month this payment covers. Null means cash treatment.';
comment on column money_transactions.covers_to is
  'Any day within the last month this payment covers. Null means cash treatment.';
