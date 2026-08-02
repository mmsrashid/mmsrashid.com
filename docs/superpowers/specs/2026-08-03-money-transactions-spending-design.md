# Money: Transactions & Spending Analysis — Design

**Status:** approved 3 Aug 2026
**Sub-project:** 2 of 4 in the Money module

## Context

Sub-project 1 built the accounts spine at `/dashboard/money`: `money_accounts`,
`money_balances` (dated snapshots), `money_documents`, a net-worth series derived by a pure
function, and a tabbed shell with a JARVIS sidebar. It is deployed and verified.

This sub-project adds transactions and spending analysis on top of it.

**Budgets are out of scope.** The user chose reporting without limits: "where did the money go"
rather than "did I stay under". Monthly per-category limits become a later addition once there is
enough history to know what limits are worth setting.

Also out of scope: bills & subscriptions (sub-project 3), investments (sub-project 4), Open Banking
API sync, multi-currency FX conversion.

## Goal

Import transactions from bank statements, categorise them predictably, and report where the money
went.

## Data entry

Three routes, all high volume, all landing in `money_transactions`:

1. **PDF bank statements** — the most common thing the user actually has.
2. **CSV bank exports** — bulk history.
3. **Screenshots via JARVIS** — catching a few rows rather than bulk.

A PDF statement carries both a closing balance and a transaction list, so one upload should feed
**both** `money_balances` (sub-project 1) and `money_transactions`. The ingest route returns both.

Open Banking sync stays deferred. Claude must never enter banking credentials.

## Schema — `supabase/migrations/014_spending.sql`

### `money_categories`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid not null | → `auth.users(id)` on delete cascade |
| `name` | text not null | |
| `kind` | text not null | `spending` \| `income` \| `transfer` |
| `sort_order` | int not null default 0 | |
| `created_at` | timestamptz not null default now() | |

Unique index on `(user_id, lower(name))`.

Seeded with a starter set of UK-typical categories, all editable and extendable: Groceries,
Eating out, Transport, Fuel, Utilities, Rent/Mortgage, Health, Pharmacy, Insurance, Subscriptions,
Shopping, Home, Travel, Fees & charges, Cash, Other (spending); Salary, Interest, Refunds, Other
income (income); Transfer (transfer).

### `money_transactions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid not null | → `auth.users(id)` on delete cascade |
| `account_id` | uuid not null | → `money_accounts(id)` on delete cascade |
| `txn_date` | date not null | |
| `description` | text not null | raw, exactly as printed |
| `merchant` | text | cleaned/normalised, nullable |
| `amount` | numeric(14,2) not null | **negative = out, positive = in** |
| `category_id` | uuid | → `money_categories(id)` on delete set null |
| `category_source` | text | check in (`rule`, `ai`, `manual`); null when uncategorised |
| `document_id` | uuid | → `money_documents(id)` on delete set null |
| `external_id` | text | the bank's own reference, when supplied |
| `dedupe_key` | text not null | see below |
| `notes` | text | |
| `created_at` | timestamptz not null default now() | |

Constraint: `unique (user_id, dedupe_key)`.

Indexes: `(user_id, txn_date desc)`, `(account_id, txn_date desc)`, `(category_id)`.

### `money_category_rules`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid not null | → `auth.users(id)` on delete cascade |
| `match_type` | text not null | `contains` \| `exact` \| `regex` |
| `pattern` | text not null | |
| `category_id` | uuid not null | → `money_categories(id)` on delete cascade |
| `priority` | int not null default 100 | lower runs first |
| `created_at` | timestamptz not null default now() | |

Note the deliberate asymmetry in what happens when a category is deleted: its **rules cascade away**,
because a rule pointing at a category that no longer exists can never fire and is just debris; but
its **transactions survive** with `category_id` set to null, because the spending happened whatever
you later decide to call it. Losing a transaction to a bookkeeping change would be data loss.

RLS enabled on all three tables, policy
`for all using (auth.uid() = user_id) with check (auth.uid() = user_id)`.

Every table needs a policy covering **every operation the app performs**. `004_health.sql` gave
`health_blood_markers` a SELECT policy only, which silently broke both its POST route and a JARVIS
tool with "new row violates row-level security policy".

## The four decisions that matter

### 1. Duplicate detection

Re-uploading an overlapping statement must not double-count, but **two identical coffees on the same
day are legitimately two transactions.** A unique key on `(account, date, amount, description)` would
silently merge them and understate spending — a wrong number that looks plausible.

`dedupe_key` is therefore:

```
sha256(account_id | txn_date | amount_in_pence | normalised_description | occurrence_index)
```

`occurrence_index` is the 0-based position of this transaction within its
`(account, date, amount, normalised description)` group, counted across rows already stored **plus**
rows earlier in the same import batch.

- Two £3.20 Pret charges on 4 Feb → indices 0 and 1 → two rows, both kept.
- Re-uploading the same statement → identical indices → identical keys → upsert, no growth.
- Jan–Feb and Feb–Mar statements overlapping on February → February rows produce identical keys → deduped.

When the bank supplies its own reference, `dedupe_key` is
`sha256(account_id | external_id)` instead, as that is authoritative and immune to description
reformatting between exports.

`normalised_description` lowercases, collapses whitespace, and strips trailing reference numbers and
dates that banks vary between exports — otherwise the same transaction re-exported in a different
format would look new.

### 2. Sign convention

`amount` is **negative for money out, positive for money in**, normalised at the parser boundary.

Bank exports disagree: separate Debit and Credit columns; a single signed column; outgoings wrapped
in brackets; a `Type` column saying DR/CR. The CSV parser and the extractor both normalise so that
nothing downstream has to guess. Display flips the sign for readability, but stored data has one
convention only.

### 3. Transfers are excluded from spending and income

Moving £500 from current to savings appears **twice** — out of one account, into the other. Counted
naïvely that is £500 of spending *and* £500 of income, making every total untrustworthy.

`money_categories.kind = 'transfer'` excludes a transaction from both spending and income
aggregates. The default rules assign obvious transfer descriptions to it, and the reporting layer
always filters on `kind`, never on category name.

### 4. Mixed currencies are not summed

A transaction inherits its currency from its account. Summing spending across accounts in different
currencies would produce a confidently wrong total, exactly as it would for net worth — so the
spending aggregates apply the same guard `buildNetWorthSeries` does: if the accounts in scope span
more than one currency, return a warning instead of a total. FX conversion stays out of scope.

### 5. Uncategorised is surfaced, never hidden

Uncategorised transactions distort every figure while looking like nothing is wrong. The month view
states the uncategorised **count and value** prominently, and the category breakdown shows
Uncategorised as its own line rather than dropping those rows.

## Categorisation

On import, each transaction is categorised in this order:

1. **Rules** — evaluated by ascending `priority`, first match wins. `category_source = 'rule'`.
2. **Claude** — only for rows no rule matched, in one batched call rather than one per row.
   `category_source = 'ai'`.
3. **Left uncategorised** if Claude is unsure.

Every AI decision is offered back as a **proposed rule**, so correcting a guess once fixes it
everywhere and future imports become deterministic. Re-running categorisation over existing
transactions is therefore cheap and repeatable.

A manual change sets `category_source = 'manual'`, and **manual never gets overwritten** by a later
rule or AI pass. A correction the user made by hand is the most reliable signal in the system.

## Reconciliation

Transactions do not drive balances — snapshots remain the source of truth for net worth, exactly as
sub-project 1 specified.

But between two consecutive balance snapshots for an account, the sum of transactions in that window
*should* approximate the balance change. When it does not, that usually means a missed statement page
or a gap in imported history, which is otherwise invisible. The account view shows a reconciliation
line per snapshot interval, flagging a discrepancy over £1 and stating the gap.

This is a warning, never an automatic correction. The app must not invent a transaction to make the
arithmetic work.

## API

| Route | Methods | Notes |
|---|---|---|
| `/api/money/transactions` | GET, POST | GET paged past the 1000-row cap; filters: account, date range, category, uncategorised |
| `/api/money/transactions/[id]` | PATCH, DELETE | PATCH sets `category_source = 'manual'` |
| `/api/money/transactions/recategorise` | POST | Re-run rules over existing rows; never overwrites manual |
| `/api/money/categories` | GET, POST | |
| `/api/money/categories/[id]` | PATCH, DELETE | DELETE nulls the category on its transactions, not deletes them |
| `/api/money/rules` | GET, POST | |
| `/api/money/rules/[id]` | PATCH, DELETE | |
| `/api/money/ingest` | POST | extended to return transactions as well as balances |

`GET /api/money/transactions` **must page explicitly**; a statement year is thousands of rows and a
silently truncated spending total looks self-consistent.

Validation: reject a non-finite `amount`; reject a `txn_date` more than one day in the future
(statements occasionally carry a pending entry dated tomorrow, so one day of tolerance, not zero);
reject an unknown `account_id`; map a check-constraint violation to a readable 400.

## UI

Two new tabs in the existing shell, which was built to accept them:

- **Spending** — month selector; totals in/out/net; category breakdown with share bars;
  uncategorised count and value; top merchants; a category-trend chart across months.
- **Transactions** — filterable, paged table; inline category editing; a "create rule from this"
  action; bulk categorise for a filtered selection.

Categories and rules are managed from the Spending tab rather than a third tab, to avoid a tab per
noun.

Components under `components/money/`: `SpendingByCategory.tsx`, `CategoryTrend.tsx` (hand-rolled SVG
like `NetWorthTrend`), `TransactionTable.tsx`, `CategoryPicker.tsx`, `RuleEditor.tsx`.

## Extraction

`lib/money/extract-transactions.ts`, a Claude tool-schema extractor returning
`{ txn_date, description, amount, direction, external_id, confidence }` per row.

Two things the balance extractor did not have to handle:

- **Volume.** A 20-page statement is easily 200+ transactions, far past a 2048-token ceiling.
  `max_tokens` is raised to 8192, and long documents are processed in page batches with results
  concatenated. If a batch returns nothing, that is surfaced as an error rather than treated as "no
  transactions" — silently dropping a page is how history goes missing.
- **Running balance columns.** Statements often show a running balance beside each row; the
  extractor must not mistake that for the transaction amount.

`lib/money/parse-transaction-csv.ts` handles CSV, reusing the RFC-4180 splitter and the
local-vs-UTC date handling from `parse-csv.ts` — reading UTC parts shifts every date back a day in
any timezone ahead of UTC, a bug this codebase already hit in `parse-pill-csv.ts`.

## JARVIS tools

Added to `lib/money/jarvis-tools.ts`: `get_spending_summary` (month or range, by category),
`get_transactions` (filtered), `categorise_transactions` (apply a rule), `add_category_rule`.

`get_spending_summary` must always report the uncategorised count alongside any total, so JARVIS
cannot present an incomplete figure as complete. JARVIS remains explicitly not a financial adviser.

## Privacy

Transaction descriptions are highly revealing personal data. RLS scopes every row to its owner.
Amounts and descriptions must never be written to logs or error messages.

## Tests

Unit tests, all pure functions:

- `dedupe-key.ts`: two identical same-day transactions get different keys; re-importing produces
  identical keys; an overlapping statement window dedupes; description reformatting does not create a
  new key; `external_id` takes precedence.
- `parse-transaction-csv.ts`: separate debit/credit columns; single signed column; bracketed
  negatives; DR/CR type column; local-vs-UTC date boundary; a bad row reported not dropped silently.
- `categorise.ts`: rule priority order; first match wins; `manual` never overwritten; unmatched left
  null; transfer kind excluded from spending totals.
- `spending-summary.ts`: transfers excluded from both totals; uncategorised reported separately;
  month boundaries inclusive; empty state returns zeros not NaN.
- `reconcile.ts`: matching window passes; a missing transaction is flagged with the gap; no snapshot
  pair yields no warning rather than a false one.

Then end-to-end verification against the deployed site, since `.env.local` has no working keys and
local dev cannot reach the database.

## Success criteria

1. A PDF statement upload files both balances and transactions.
2. Re-uploading the same or an overlapping statement does not duplicate anything.
3. Two identical same-day transactions are both preserved.
4. Categories are assigned by visible rules; correcting one creates a rule that applies everywhere.
5. A manual category is never overwritten by a later import.
6. Transfers do not appear in spending or income totals.
7. The Spending tab shows the uncategorised count and value alongside every total.
8. A gap between transactions and a balance change is flagged, not silently corrected.
9. JARVIS can answer "what did I spend on groceries in June" with its coverage caveat.
