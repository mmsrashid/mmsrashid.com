-- Identifying details for an account, so a statement can be matched to it and
-- a payment set up without digging out the bank app.
--
-- TEXT, not numeric, for both: a sort code and an account number can begin with
-- a zero, and a numeric column would silently drop it and corrupt the value.
-- They are also not arithmetic — nothing is ever computed from them.
alter table money_accounts
  add column if not exists account_number text,
  add column if not exists sort_code text,
  add column if not exists iban text,
  add column if not exists account_holder text;

-- A sort code and account number are printed on cheques and invoices and are
-- not credentials — they cannot move money on their own. They are still
-- identifying data, so they live behind the same row-level security as
-- everything else and are never written to logs.
comment on column money_accounts.account_number is
  'Identifying only. Never logged. Masked in the UI by default.';
