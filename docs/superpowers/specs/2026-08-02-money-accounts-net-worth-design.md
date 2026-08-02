# Money: Accounts & Net Worth — Design

**Status:** approved 2 Aug 2026
**Sub-project:** 1 of 4 in the Money module

## Context

`mmsrashid.com` has a Health module at `/dashboard/health`: a tabbed shell, `app/api/health/*`,
`lib/health/*`, `components/health/*`, and numbered SQL migrations applied by hand through the
Supabase dashboard. The Money module follows the same shape so the two feel like one product.

The user wants Money to cover spending & budgets, bills & subscriptions, net worth & accounts, and
investments. That is four independent subsystems, so it is split into four sub-projects, each with
its own spec, plan and build cycle.

All four hang off a shared **accounts spine**: a transaction comes *from* an account, a bill is
*paid from* one, net worth is the *sum of* their balances, and holdings *sit inside* one. Building
the spine first de-risks the other three and is useful on its own.

| # | Sub-project | Rationale for the order |
|---|---|---|
| 1 | **Accounts + net worth** (this spec) | The spine. Smallest slice that is useful alone. |
| 2 | Spending & budgets | Largest piece; needs accounts to exist. |
| 3 | Bills & subscriptions | More useful once spending data can confirm a bill went out. |
| 4 | Investments & portfolio | Most specialised, least coupled. |

**Out of scope for this sub-project:** transactions, categories, budgets, bills, holdings,
performance, Open Banking API sync, multi-currency FX conversion.

## Goal

Record what the user owns and owes across accounts, and chart net worth over time.

## Data entry

Three routes, all landing in the same `money_balances` table:

1. **Manual** — type a balance for an account, dated.
2. **Screenshot / PDF via JARVIS** — reuses the Health ingest pipeline.
3. **CSV import** — for backfilling history in bulk.

Open Banking sync (TrueLayer / Plaid) is explicitly deferred. It needs a provider account, API keys
and per-bank OAuth consent that only the user can give. Claude must never enter banking credentials.

## Schema — `supabase/migrations/012_money.sql`

### `money_accounts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `user_id` | uuid not null | → `auth.users(id)` on delete cascade |
| `name` | text not null | e.g. "Barclays Current" |
| `institution` | text | e.g. "Barclays" |
| `kind` | text not null | see enumeration below |
| `currency` | text not null default `'GBP'` | |
| `opened_date` | date | |
| `closed_date` | date | |
| `status` | text not null default `'active'` | `active` \| `closed` |
| `notes` | text | |
| `created_at` | timestamptz not null default now() | |

`kind` ∈ `current, savings, isa, pension, investment, credit_card, mortgage, loan, property, other`.

Partial unique index on `(user_id, lower(name)) where status = 'active'` — prevents duplicate live
accounts while allowing a closed account to keep a name that is later reused.

**Asset vs liability is derived from `kind`, not stored.** A single `LIABILITY_KINDS` set in
`lib/money/types.ts` is the only place the distinction lives, so a bad write cannot make a mortgage
count as an asset.

### `money_balances`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid not null | → `auth.users(id)` on delete cascade |
| `account_id` | uuid not null | → `money_accounts(id)` on delete cascade |
| `as_of` | date not null | |
| `balance` | numeric(14,2) not null | |
| `source` | text not null default `'manual'` | `manual` \| `import` \| `document` \| `api` |
| `document_id` | uuid | the file it was read from, if any |
| `notes` | text | |
| `created_at` | timestamptz not null default now() | |

Constraint: `unique (user_id, account_id, as_of)`.

Indexes: `(user_id, as_of desc)` and `(account_id, as_of desc)`.

`document_id` references `money_documents(id)` with `on delete set null` — deleting the source file
must not delete the balance that was read from it, only the link back to it.

### `money_documents`

Needed so an ingested statement or screenshot can be stored, listed and re-opened, and so
`money_balances.document_id` has something to point at.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid not null | → `auth.users(id)` on delete cascade |
| `name` | text not null | |
| `kind` | text not null default `'statement'` | `statement` \| `screenshot` \| `csv` \| `other` |
| `storage_path` | text not null | object in the `money-documents` bucket |
| `file_size_bytes` | bigint | |
| `extracted_balance_count` | int not null default 0 | |
| `created_at` | timestamptz not null default now() | |

RLS enabled on all three tables, policy
`for all using (auth.uid() = user_id) with check (auth.uid() = user_id)`.

Each table needs a policy covering **every operation the app actually performs**. `004_health.sql`
gave `health_blood_markers` a SELECT policy only, which silently broke both its POST route and a
JARVIS tool with "new row violates row-level security policy".

### Three schema decisions worth stating

**`numeric`, never float.** Binary floating point cannot represent `0.10` exactly. Money in a
float silently drifts, and a net worth that disagrees with itself is worse than no figure.

**`as_of` is a `date`, not a `timestamptz`.** A bank balance is "as of the 3rd", not "as of 14:32".
This deliberately differs from `health_vitals.measured_at`, where a blood pressure genuinely
belongs to a moment in time.

**Unique key excludes `source`.** `health_vitals` keys on `(user, instant, source)` because a watch
reading and a clinic reading at the same instant are two real, independently valid measurements. A
bank balance on a given date has exactly **one** true value, so a CSV import and a screenshot of the
same day must reconcile to a single row with the newest write winning — not sit side by side as two
contradictory numbers.

### Sign convention

Balances are entered **as printed on the statement**: a £250,000 mortgage is stored as `250000`,
positive. Net worth is `Σ assets − Σ liabilities`.

There is no non-negative check, because an asset account can legitimately be negative (an
overdrawn current account).

## Net worth calculation

A pure function in `lib/money/net-worth.ts`, not inline in the page, so it is unit-testable and
shared with the JARVIS tools:

```ts
buildNetWorthSeries(accounts, balances) → {
  points: Array<{
    date: string, assets: number, liabilities: number, net: number,
    accountsCounted: number, accountsTotal: number,
  }>,
  currencyWarning: string | null,
}
```

The points are wrapped in an object so the currency warning has somewhere to live — a bare array
would force the caller to re-derive it.

Rules:

1. **Carry the last known balance forward** per account. Balances arrive at irregular intervals; a
   balance holds until superseded.
2. **Exclude an account before its first snapshot.** If a pension is added in March, January's net
   worth must not treat it as £0 — that would draw a fake step-change. This is the same class of bug
   as the pill tracker counting a medicine on days outside its prescription window.
3. **Exclude a closed account after `closed_date`**, while keeping its history intact before it.
4. **Return `accountsCounted`** so the UI can say "12 of 14 accounts" rather than implying a
   complete picture it does not have.
5. **Refuse to sum mixed currencies.** If accounts span more than one currency, return a warning
   instead of a total. FX conversion is out of scope, and a silently-wrong headline number is worse
   than an admitted gap.

## API

| Route | Methods | Notes |
|---|---|---|
| `/api/money/accounts` | GET, POST | |
| `/api/money/accounts/[id]` | PATCH, DELETE | DELETE cascades balances; UI must warn |
| `/api/money/balances` | GET, POST | POST upserts on the unique key |
| `/api/money/balances/[id]` | PATCH, DELETE | |
| `/api/money/ingest` | POST | image/PDF → extracted balances |

`GET /api/money/balances` **pages past PostgREST's 1000-row default cap**, as the pill tracker had
to. A silently truncated series is worse than none, because it looks self-consistent.

Validation: reject a `balance` that is not a finite number; reject an `as_of` in the future (a
future-dated balance is a typo, not intent); reject a balance for an unknown account; map a Postgres
check-constraint violation to a readable 400 rather than leaking raw constraint text in a 500.

**`closed_date` is derived in the route, not left to callers.** `PATCH /api/money/accounts/[id]`
sets `closed_date` to today when `status` flips to `closed`, and clears it when it flips back to
`active`, unless an explicit `closed_date` is supplied. An explicit value always wins.

This is not hypothetical tidiness: the Medicines tab's Stop button sent `status` alone and left
`end_date` null, so two doses of the same drug ended up inconsistent — and because `end_date` feeds
the adherence denominator, a drug stopped from the UI kept counting as due. `closed_date` feeds the
net worth series the same way, so the same omission here would keep a closed account in the total
forever. Derive it once, server-side, where every caller gets it.

## UI

`/dashboard/money` with a tab shell mirroring `HealthShell`, built to accept the Spending, Bills and
Investments tabs later without restructuring.

- **Overview** — headline net worth, net-worth-over-time chart, accounts grouped into Assets and Debts.
- **Accounts** — create, edit, close, delete; add a balance inline.
- **History** — every snapshot, editable and deletable.

Components under `components/money/`: `MoneyShell.tsx`, `NetWorthTrend.tsx` (hand-rolled SVG, as
`BloodPressureTrend` is — no chart library), `AccountCard.tsx`, `BalanceForm.tsx`, `PendingReview.tsx`.

Charts must show the `accountsCounted` caveat and any currency warning, not just the number.

## Ingest

`POST /api/money/ingest` reuses the Health pipeline:

- Claude tool-schema extraction (guaranteed-valid JSON rather than parsed prose), returning
  `{ account_name, balance, as_of, currency, confidence }` per row.
- Account names fuzzy-matched to existing accounts with the same edit-distance matcher that handles
  `Tigagrelor` / `Ticagrelor`, in `lib/money/match-account.ts`.
- **Low-confidence rows go to pending review, never auto-applied.** An unreviewed wrong balance
  corrupts the whole series from that date forward.
- Files stored in a **separate private `money-documents` bucket**, not the health one, accessed via
  short-lived signed URLs.

CSV import lives in `lib/money/parse-csv.ts`. Dates must be read from **local** date parts, not UTC —
reading UTC parts shifts every date back a day in any timezone ahead of UTC, which is a bug this
codebase has already been bitten by once in `parse-pill-csv.ts`.

## JARVIS tools

Added in `lib/money/jarvis-tools.ts` and merged into the existing `TOOLS` array:
`get_accounts`, `get_net_worth`, `get_balance_history`, `add_balance`.

`add_balance` must report what it wrote rather than confirming silently, and must not guess between
similarly-named accounts — it returns the candidates instead, as `set_medicine_status` does.

## Privacy

This is sensitive financial data. RLS scopes every row to its owner. Balances must never be written
to logs or error messages. `money-documents` stays private with signed-URL access only.

## Tests

Unit tests for `net-worth.ts`, covering the cases most likely to be wrong:

- an account added mid-series is not back-counted as zero before its first snapshot
- liabilities subtract rather than add
- a closed account drops out after `closed_date` but keeps earlier history
- two balances on one date resolve to the newest
- mixed currencies return a warning rather than a total
- empty state returns an empty series, not a zero point

Tests for `parse-csv.ts` on the local-vs-UTC date boundary, and for `match-account.ts` on
near-miss names.

Then end-to-end verification against the deployed site in the browser, since `.env.local` has no
service-role key and local dev cannot reach the database.

## Success criteria

1. Accounts can be created, edited, closed and deleted.
2. Balances can be added manually, by CSV, and from a screenshot or PDF through JARVIS.
3. The Overview shows net worth today and a correct trend over time.
4. An account added mid-history does not distort earlier net worth.
5. Mixed currencies produce a warning, not a wrong number.
6. JARVIS can answer "what's my net worth" and "how has it changed".
