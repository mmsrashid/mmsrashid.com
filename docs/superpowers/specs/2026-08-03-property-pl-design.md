# Money: Property P&L — Design

**Status:** approved 3 Aug 2026
**Sub-project:** 5 of the Money module (after accounts, spending; before bills, investments)

## Context

The user holds **four tenanted properties**, referred to by code: **4FLH, 59CH, 85KX, 24HH**. Each
carries a mortgage with interest payments. They are held **personally**, not through a company.

Sub-project 1 built `money_accounts` and dated `money_balances`. Sub-project 2 built
`money_transactions`, `money_categories` and `money_category_rules`, with import from PDF/CSV/
screenshot and rule-based categorisation.

## Goal

Show, per property and per period, what came in, what went out, and what the profit was — as both
the cash position and the taxable position, which differ.

## The decision that shapes everything: Section 24

For UK individuals, mortgage interest on residential lettings is **not** an allowable expense against
rental income. It was phased out between 2017 and 2020 and replaced with a basic-rate (20%) tax
reducer. Held through a limited company it would remain fully deductible — but these are held
personally, so it does not.

This means "profit" has two correct and materially different answers:

| | What it is | Mortgage interest |
|---|---|---|
| **Cash profit** | Rent received minus everything actually paid | Deducted in full |
| **Taxable profit** | Rent received minus *allowable* expenses | **Excluded**, then a 20% credit on it |

On a portfolio of four mortgaged properties these can differ by thousands. Reporting only one, or
blending them, produces a figure that is confidently wrong for whatever the user actually needed.

**Both are therefore shown side by side, always labelled, with the interest figure stated explicitly
so the difference is visible rather than buried.** The 20% reducer is computed and shown as a separate
line, never silently folded into a profit number.

**This is arithmetic, not advice.** The app must state that it is not tax advice and that the figures
need checking before anything is filed. It must not attempt to compute a final tax liability, which
depends on total income, other reliefs, and the user's marginal rate — none of which it knows.

## Schema — `supabase/migrations/015_property.sql`

### `money_properties`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid not null | → `auth.users(id)` on delete cascade |
| `code` | text not null | e.g. `4FLH` — how the user refers to it |
| `label` | text | fuller name or address, optional |
| `ownership` | text not null default `'personal'` | check in (`personal`, `company`) |
| `share_percent` | numeric(5,2) not null default 100 | for jointly held property |
| `acquired_date` | date | |
| `disposed_date` | date | excluded from P&L after this |
| `status` | text not null default `'active'` | check in (`active`, `sold`) |
| `notes` | text | |
| `created_at` | timestamptz not null default now() | |

Unique index on `(user_id, lower(code))`.

`ownership` is per property even though all four are currently personal: a future incorporation
should not require a migration, and the interest treatment is then applied per property rather than
globally.

`share_percent` exists because jointly held property splits income and expenses — reporting 100% of a
50%-owned property's profit would overstate it by double.

### Tagging transactions to a property

```sql
alter table money_transactions
  add column if not exists property_id uuid
  references money_properties(id) on delete set null;

create index if not exists money_transactions_property
  on money_transactions (property_id);
```

**Deliberately no separate income/expense tables.** Rent arriving and a repair being paid are
transactions like any other — they arrive in the same statements, through the same import, and match
the same rules. A parallel data model would mean two places for the same fact to live, and they would
drift.

`on delete set null`, consistent with categories: deleting a property must not delete the financial
history of having owned it.

### `money_property_expense_kinds`

Not a table. Expense classification reuses `money_categories`, extended with a flag:

```sql
alter table money_categories
  add column if not exists property_treatment text
  check (property_treatment in ('rental_income','allowable','interest','capital','non_allowable'));
```

- `rental_income` — rent received
- `allowable` — deductible against rental income (letting fees, repairs, insurance, safety certificates, ground rent, service charge)
- `interest` — mortgage interest: cash expense, **not** allowable, drives the 20% reducer
- `capital` — improvements rather than repairs: not deductible against income at all, relevant to CGT on disposal
- `non_allowable` — anything explicitly not deductible

The repair-versus-improvement line is the other classic trap: a new kitchen replacing an old one is
usually a repair, an extension is capital. The app records the user's classification and shows the
capital total separately; it does not attempt to decide which is which.

Seeded categories are extended with property-specific ones: Rent received, Letting fees, Property
repairs, Property insurance, Ground rent & service charge, Safety certificates, Mortgage interest,
Property improvements.

## P&L derivation

A pure function in `lib/money/property-pl.ts`:

```ts
buildPropertyPL(properties, transactions, categories, period) → {
  perProperty: Array<{
    propertyId, code, sharePercent,
    rentReceived, allowableExpenses, mortgageInterest, capitalSpend, otherNonAllowable,
    cashProfit,          // rent − allowable − interest − otherNonAllowable
    taxableProfit,       // rent − allowable          (interest excluded)
    interestTaxReducer,  // interest × 0.20, capped at taxableProfit × 0.20
    untaggedWarning,
  }>,
  totals: { …the same fields summed… },
  untaggedCount: number,
  untaggedValue: number,
  currencyWarning: string | null,
}
```

Rules:

1. **Share is applied to every figure**, not just profit, so a jointly held property reports the
   user's portion throughout.
2. **A property is excluded after `disposed_date`**, keeping its history before it — the same
   carried-forward-window logic as `closed_date` in net worth and `end_date` in the pill tracker.
3. **The interest reducer is capped.** The relief is limited to 20% of the lower of finance costs and
   property profits; an uncapped 20% of interest would overstate it in a loss-making year. The cap is
   applied and stated.
4. **Untagged property transactions are counted and surfaced**, exactly as uncategorised spending is:
   a P&L missing half its expenses looks like a very profitable portfolio.
5. **Mixed currencies return a warning rather than a total**, consistent with net worth and spending.

## Property tagging on import

Statement descriptions for a rental portfolio usually carry the property reference — a tenant's
standing order often names the property or flat number. So tagging reuses the rules mechanism:
`money_category_rules` gains an optional `property_id`, letting one rule set both category and
property.

```sql
alter table money_category_rules
  add column if not exists property_id uuid
  references money_properties(id) on delete cascade;
```

A rule matching `4FLH` can therefore tag the property and categorise it as Rent received in one
step, and the user's four codes make this unusually reliable — they are distinctive strings unlikely
to appear by accident.

Where no rule matches, the transaction stays untagged and is listed for the user to assign. Claude
may suggest a property when a code appears in the description, but a suggestion is only applied when
the code matches exactly — inferring a property from a vague description would put income against
the wrong asset.

## API

| Route | Methods |
|---|---|
| `/api/money/properties` | GET, POST |
| `/api/money/properties/[id]` | PATCH, DELETE |
| `/api/money/property-pl` | GET — computed P&L for a period |

`PATCH` derives `disposed_date` when `status` flips to `sold`, and clears it on reactivation — the
same server-side derivation as `closed_date` and `end_date`, for the same reason: a caller that sends
only `status` would otherwise leave a sold property in the P&L forever.

Transaction tagging uses the existing `PATCH /api/money/transactions/[id]`, extended to accept
`property_id`.

## UI

A **Property P&L** tab in the existing Money shell:

- Period selector (tax year and calendar month; UK tax years run 6 April to 5 April, so the tax-year
  option must use those boundaries, not January).
- A row per property: rent, allowable expenses, interest, cash profit, taxable profit.
- A portfolio total row.
- The interest reducer shown as its own labelled line, with the cap stated when it bites.
- An untagged banner when property transactions are unassigned.
- A standing note that this is arithmetic, not tax advice.

Component: `components/money/PropertyPLTable.tsx`.

## JARVIS tools

`get_property_pl` (period, optional property code) and `tag_transaction_property`.

`get_property_pl` must return cash and taxable profit **both labelled**, plus the untagged count, and
must never present one as "the" profit. JARVIS is explicitly not a tax adviser and must say so when
asked anything approaching a filing question.

## Tests

- `property-pl.ts`: interest excluded from taxable but included in cash; share applied to every
  figure; disposed property excluded after disposal but retained before; reducer capped at 20% of
  profit in a low-profit year and zero in a loss; untagged counted; capital spend excluded from both
  profits but reported; mixed currency warning; empty period returns zeros not NaN.
- Property tagging: an exact code match tags; a near-miss does not.

## Success criteria

1. The four properties can be created by code and each tagged from statement descriptions by rule.
2. A property P&L shows rent, allowable expenses, interest, cash profit and taxable profit per property.
3. Mortgage interest is excluded from taxable profit and included in cash profit, visibly.
4. The 20% reducer is shown separately and capped correctly.
5. Untagged property transactions are surfaced, not silently omitted.
6. A jointly held property reports only the user's share.
7. Nothing in the UI or JARVIS presents a figure as tax advice.
