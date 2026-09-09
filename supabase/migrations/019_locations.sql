-- Locations: the second dimension on a transaction, generalised.
--
-- A transaction already carried a category (what kind of money it is) and a
-- property (which flat it belongs to). The second dimension is really "who or
-- what was this for", and a property is only one answer to that — a payment can
-- equally belong to a person.
--
-- The existing four properties are untouched. This adds a kind so the same
-- table can hold people alongside them, because the alternative — a second
-- table and moving the property rows into it — would put the property P&L and
-- every property_id on 845 transactions at risk to gain nothing.
--
-- money_transactions.property_id keeps its name. It now means "location", and
-- renaming a column referenced across the API, the P&L and the rules engine
-- would be churn for a word.

alter table money_properties
  add column if not exists kind text not null default 'property';

alter table money_properties
  drop constraint if exists money_properties_kind_check;
alter table money_properties
  add constraint money_properties_kind_check
  check (kind in ('property', 'person', 'other'));

-- Everything already there is a property, which is what the default gives —
-- stated explicitly so re-running this cannot reclassify anything.
update money_properties set kind = 'property' where kind is null;

-- The property P&L filters to kind = 'property', so this index carries the
-- filter it actually runs.
create index if not exists money_properties_kind_idx
  on money_properties (user_id, kind, code);

comment on column money_properties.kind is
  'property | person | other. Only kind = property appears in the property P&L; '
  'a person-tagged transaction stays in the personal book.';
