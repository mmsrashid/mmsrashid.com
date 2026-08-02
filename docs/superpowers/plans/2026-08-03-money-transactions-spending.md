# Money: Transactions & Spending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import transactions from PDF statements, CSV exports and screenshots, categorise them by visible editable rules, and report where the money went.

**Architecture:** Three tables (`money_categories`, `money_transactions`, `money_category_rules`) on top of sub-project 1's accounts spine. All derivation — dedupe keys, categorisation, spending aggregates, reconciliation — lives in pure functions under `lib/money/` so it is unit-testable without a database. Two new tabs in the existing Money shell.

**Tech Stack:** Next.js 16.2.9 (App Router), Supabase (Postgres + Auth + Storage), Anthropic SDK (`claude-haiku-4-5-20251001`), Node `crypto` for hashing, Jest, hand-rolled SVG charts.

**Spec:** `docs/superpowers/specs/2026-08-03-money-transactions-spending-design.md`

---

## Before you start — things about this codebase you cannot guess

1. **This is not the Next.js in your training data.** Read `node_modules/next/dist/docs/` before writing routing code. `middleware` is renamed `proxy`, and dynamic route `params` is a **Promise** — `const { id } = await ctx.params`.
2. **There is no `test` script.** Run `npx jest` directly, or `npx jest path/to/file.test.ts` for one file.
3. **One test may already be failing** — `__tests__/components/Navbar.test.tsx` › "renders nav links", a stale assertion about a nav link that no longer exists. Unrelated to this work. A background task may have fixed it; if it is still red, ignore it.
4. **Local dev cannot reach the database.** `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` but `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `ANTHROPIC_API_KEY` are **empty placeholders**. Verify database work against the **deployed** site. `npx next build` will fail prerendering `/auth/update-password` for this reason; build with a dummy key to check compilation: `NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ.dummy.sig" npx next build`.
5. **Migrations are applied by hand** through the Supabase SQL editor — there is no `supabase db push` here. Only the Chrome profile named **"Personal Chrome"** can reach project `bqljckwsibjlxhikilua`; use `switch_browser` and pick it (do not ask which deviceId — the list shows unhelpful generic names).
6. **The SQL editor is unreliable.** `window.monaco` is undefined until you click into the editor body, and `/sql/new` often hangs on a spinner for 5–10s. Set SQL with `window.monaco.editor.getModels()[0].setValue(sql)`, then click **Run**. A "Potential issue detected" dialog appears for anything containing `drop policy` — click **Run query**. Reading results via screenshot often times out; read the grid from the DOM instead: `[...document.querySelectorAll('[role="gridcell"]')].map(e=>e.innerText)`.
7. **PostgREST caps rows at 1000.** Any list endpoint must page with `.range()`. A truncated spending total looks self-consistent and is therefore worse than an error.
8. **Push protocol:** `gh auth switch --user mmsrashid` before pushing, then `gh auth switch --user mmsrashid-profinity` afterwards.
9. **Money is `numeric` in the database and integer pence when summing in JS.** `lib/money/net-worth.ts` shows the pattern.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/014_spending.sql` | Three tables, RLS, indexes, seeded categories |
| `lib/money/spending-types.ts` | Enumerations and interfaces for this sub-project |
| `lib/money/dedupe-key.ts` | Normalise a description; import keys (idempotent) and append keys (manual) |
| `lib/money/categorise.ts` | Apply rules in priority order; never overwrite manual |
| `lib/money/spending-summary.ts` | Month/range aggregates, transfers excluded, currency guard |
| `lib/money/reconcile.ts` | Compare transaction sums against balance changes |
| `lib/money/parse-transaction-csv.ts` | CSV → transaction rows, all sign conventions normalised |
| `lib/money/extract-transactions.ts` | Claude extraction from PDF/image, batched for volume |
| `app/api/money/transactions/route.ts` | GET (paged, filtered), POST |
| `app/api/money/transactions/[id]/route.ts` | PATCH (sets manual), DELETE |
| `app/api/money/transactions/recategorise/route.ts` | Re-run rules over existing rows |
| `app/api/money/categories/route.ts` + `[id]` | Category CRUD |
| `app/api/money/rules/route.ts` + `[id]` | Rule CRUD |
| `app/api/money/ingest/route.ts` | **Modify:** also extract and file transactions |
| `app/(dashboard)/dashboard/money/spending/page.tsx` | Month view, category breakdown, trend |
| `app/(dashboard)/dashboard/money/transactions/page.tsx` | Filterable table, inline categorising |
| `components/money/SpendingByCategory.tsx` | Breakdown with share bars |
| `components/money/CategoryTrend.tsx` | SVG trend across months |
| `components/money/TransactionTable.tsx` | Rows, inline category picker, create-rule action |
| `components/money/MoneyShell.tsx` | **Modify:** add two tabs |
| `lib/money/jarvis-tools.ts` | **Modify:** four spending tools |
| `__tests__/lib/money/dedupe-key.test.ts` | |
| `__tests__/lib/money/categorise.test.ts` | |
| `__tests__/lib/money/spending-summary.test.ts` | |
| `__tests__/lib/money/reconcile.test.ts` | |
| `__tests__/lib/money/parse-transaction-csv.test.ts` | |

---

## Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/014_spending.sql`

- [ ] **Step 1: Write the migration**

```sql
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
  -- Includes an occurrence index, so two identical same-day transactions both
  -- survive while a re-uploaded or overlapping statement still collapses.
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
```

- [ ] **Step 2: Apply it**

`switch_browser` → "Personal Chrome". Open
`https://supabase.com/dashboard/project/bqljckwsibjlxhikilua/sql/new`, wait for it to load, click
into the editor body, then set the SQL via
`window.monaco.editor.getModels()[0].setValue(sql)` and click **Run**. Accept the
"Potential issue detected" dialog.

Expected: `Success. No rows returned`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/014_spending.sql
git commit -m "feat: spending schema — categories, transactions, rules"
```

---

## Task 2: Types and default categories

**Files:**
- Create: `lib/money/spending-types.ts`

- [ ] **Step 1: Write the types**

```ts
export const CATEGORY_KINDS = ['spending', 'income', 'transfer'] as const
export type CategoryKind = (typeof CATEGORY_KINDS)[number]

export const MATCH_TYPES = ['contains', 'exact', 'regex'] as const
export type MatchType = (typeof MATCH_TYPES)[number]

export const CATEGORY_SOURCES = ['rule', 'ai', 'manual'] as const
export type CategorySource = (typeof CATEGORY_SOURCES)[number]

export interface MoneyCategory {
  id: string
  user_id: string
  name: string
  kind: CategoryKind
  sort_order: number
  created_at: string
}

export interface MoneyTransaction {
  id: string
  user_id: string
  account_id: string
  txn_date: string
  description: string
  merchant: string | null
  /** Negative is money out, positive is money in. */
  amount: number
  category_id: string | null
  category_source: CategorySource | null
  document_id: string | null
  external_id: string | null
  dedupe_key: string
  notes: string | null
  created_at: string
}

export interface MoneyCategoryRule {
  id: string
  user_id: string
  match_type: MatchType
  pattern: string
  category_id: string
  priority: number
  created_at: string
}

/** A row from a parser or extractor, before it becomes a transaction. */
export interface ParsedTransaction {
  txn_date: string
  description: string
  amount: number
  external_id: string | null
}

/**
 * Starter categories. UK-typical, all editable — seeded on first use rather than
 * in SQL so the list lives with the code that depends on it.
 */
export const DEFAULT_CATEGORIES: { name: string; kind: CategoryKind }[] = [
  { name: 'Groceries', kind: 'spending' },
  { name: 'Eating out', kind: 'spending' },
  { name: 'Transport', kind: 'spending' },
  { name: 'Fuel', kind: 'spending' },
  { name: 'Utilities', kind: 'spending' },
  { name: 'Rent / Mortgage', kind: 'spending' },
  { name: 'Health', kind: 'spending' },
  { name: 'Pharmacy', kind: 'spending' },
  { name: 'Insurance', kind: 'spending' },
  { name: 'Subscriptions', kind: 'spending' },
  { name: 'Shopping', kind: 'spending' },
  { name: 'Home', kind: 'spending' },
  { name: 'Travel', kind: 'spending' },
  { name: 'Fees & charges', kind: 'spending' },
  { name: 'Cash', kind: 'spending' },
  { name: 'Other', kind: 'spending' },
  { name: 'Salary', kind: 'income' },
  { name: 'Interest', kind: 'income' },
  { name: 'Refunds', kind: 'income' },
  { name: 'Other income', kind: 'income' },
  { name: 'Transfer', kind: 'transfer' },
]
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add lib/money/spending-types.ts
git commit -m "feat: spending types and default category set"
```

---

## Task 3: Dedupe keys

This is the task most likely to be got wrong, and the one whose failure is least visible: a bad key
either silently merges genuine repeat purchases (understating spending) or fails to collapse a
re-import (doubling it).

**Files:**
- Create: `lib/money/dedupe-key.ts`
- Test: `__tests__/lib/money/dedupe-key.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { normaliseDescription, buildImportKeys, buildAppendKey } from '@/lib/money/dedupe-key'
import type { ParsedTransaction } from '@/lib/money/spending-types'

const t = (txn_date: string, description: string, amount: number, external_id: string | null = null):
  ParsedTransaction => ({ txn_date, description, amount, external_id })

describe('normaliseDescription', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normaliseDescription('  TESCO   STORES  ')).toBe('tesco stores')
  })

  it('strips a trailing reference number banks vary between exports', () => {
    expect(normaliseDescription('TESCO STORES 3421 REF 998812'))
      .toBe(normaliseDescription('TESCO STORES 3421'))
  })

  it('strips card-present date suffixes', () => {
    expect(normaliseDescription('PRET A MANGER ON 04 FEB'))
      .toBe(normaliseDescription('PRET A MANGER'))
  })

  it('keeps genuinely different merchants distinct', () => {
    expect(normaliseDescription('TESCO')).not.toBe(normaliseDescription('SAINSBURYS'))
  })
})

describe('buildImportKeys', () => {
  it('gives two identical same-day transactions different keys', () => {
    // Two coffees on the same day at the same price are two real purchases.
    // Merging them would silently understate spending.
    const keys = buildImportKeys('acct', [
      t('2026-02-04', 'PRET A MANGER', -3.2),
      t('2026-02-04', 'PRET A MANGER', -3.2),
    ])
    expect(keys[0]).not.toBe(keys[1])
  })

  it('regenerates identical keys for a re-imported statement', () => {
    // This is what makes import idempotent: the same window in produces the same
    // keys out, so the upsert matches and nothing doubles.
    const rows = [
      t('2026-02-04', 'PRET A MANGER', -3.2),
      t('2026-02-04', 'PRET A MANGER', -3.2),
      t('2026-02-05', 'RENT', -1200),
    ]
    expect(buildImportKeys('acct', rows)).toEqual(buildImportKeys('acct', rows))
  })

  it('gives a third genuine occurrence its own key', () => {
    const two = buildImportKeys('acct', [
      t('2026-02-04', 'PRET', -3.2), t('2026-02-04', 'PRET', -3.2),
    ])
    const three = buildImportKeys('acct', [
      t('2026-02-04', 'PRET', -3.2), t('2026-02-04', 'PRET', -3.2), t('2026-02-04', 'PRET', -3.2),
    ])
    // The first two keys are unchanged, so re-importing a longer statement adds
    // only the new row.
    expect(three.slice(0, 2)).toEqual(two)
    expect(three[2]).not.toBe(three[0])
    expect(three[2]).not.toBe(three[1])
  })

  it('collapses an overlapping statement window', () => {
    // A Jan-Feb export and a Feb-Mar export both contain February.
    const janFeb = [t('2026-01-31', 'RENT', -1200), t('2026-02-04', 'PRET', -3.2)]
    const febMar = [t('2026-02-04', 'PRET', -3.2), t('2026-03-01', 'RENT', -1200)]
    const a = buildImportKeys('acct', janFeb)
    const b = buildImportKeys('acct', febMar)
    expect(b[0]).toBe(a[1])   // the shared February row
    expect(b[1]).not.toBe(a[0])
  })

  it('survives a description reformatted between exports', () => {
    const a = buildImportKeys('acct', [t('2026-02-04', 'TESCO STORES 3421 REF 9988', -12.5)])
    const b = buildImportKeys('acct', [t('2026-02-04', 'tesco  stores  3421', -12.5)])
    expect(a[0]).toBe(b[0])
  })

  it('separates the same description on different dates', () => {
    const a = buildImportKeys('acct', [t('2026-02-04', 'PRET', -3.2)])
    const b = buildImportKeys('acct', [t('2026-02-05', 'PRET', -3.2)])
    expect(a[0]).not.toBe(b[0])
  })

  it('separates the same description at different amounts', () => {
    const a = buildImportKeys('acct', [t('2026-02-04', 'PRET', -3.2)])
    const b = buildImportKeys('acct', [t('2026-02-04', 'PRET', -4.1)])
    expect(a[0]).not.toBe(b[0])
  })

  it('separates the same row on different accounts', () => {
    const row = [t('2026-02-04', 'PRET', -3.2)]
    expect(buildImportKeys('a1', row)[0]).not.toBe(buildImportKeys('a2', row)[0])
  })

  it('prefers the bank reference when supplied, ignoring description drift', () => {
    const a = buildImportKeys('acct', [t('2026-02-04', 'PRET A MANGER', -3.2, 'TXN-99')])
    const b = buildImportKeys('acct', [t('2026-02-05', 'COMPLETELY DIFFERENT', -9.9, 'TXN-99')])
    expect(a[0]).toBe(b[0])
  })
})

describe('buildAppendKey', () => {
  it('appends past an identical stored transaction', () => {
    // Typing in a second identical coffee asserts it happened as well as the
    // first, so it must not collide with it.
    const row = t('2026-02-04', 'PRET', -3.2)
    const stored = new Set(buildImportKeys('acct', [row]))
    expect(buildAppendKey('acct', row, stored)).not.toBe([...stored][0])
  })

  it('matches the import key when nothing is stored', () => {
    const row = t('2026-02-04', 'PRET', -3.2)
    expect(buildAppendKey('acct', row, new Set())).toBe(buildImportKeys('acct', [row])[0])
  })

  it('ignores stored keys from other groups', () => {
    const row = t('2026-02-04', 'PRET', -3.2)
    const unrelated = new Set(buildImportKeys('acct', [t('2026-02-04', 'TESCO', -9.9)]))
    expect(buildAppendKey('acct', row, unrelated)).toBe(buildImportKeys('acct', [row])[0])
  })

  it('uses the bank reference when supplied', () => {
    const row = t('2026-02-04', 'PRET', -3.2, 'TXN-1')
    expect(buildAppendKey('acct', row, new Set())).toBe(buildImportKeys('acct', [row])[0])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/lib/money/dedupe-key.test.ts`
Expected: FAIL — "Cannot find module '@/lib/money/dedupe-key'".

- [ ] **Step 3: Implement**

```ts
import { createHash } from 'crypto'
import type { ParsedTransaction } from './spending-types'

/**
 * Reduces a bank description to the part that identifies the transaction.
 *
 * Banks reformat descriptions between export formats and add reference numbers
 * and dates that vary run to run. Without stripping those, the same transaction
 * re-exported differently would look new and be imported twice.
 */
export function normaliseDescription(raw: string): string {
  return raw
    .toLowerCase()
    // "on 04 feb", "on 04/02", trailing card-present date markers
    .replace(/\bon\s+\d{1,2}[\s/-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2})\b.*$/i, '')
    // "ref 998812", "reference: 998812"
    .replace(/\bref(erence)?[:\s]+\S+.*$/i, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

/** The identity of a transaction, excluding which occurrence of it this is. */
export function groupKey(accountId: string, row: ParsedTransaction): string {
  const pence = Math.round(row.amount * 100)
  return `${accountId}|${row.txn_date}|${pence}|${normaliseDescription(row.description)}`
}

/**
 * Keys for a batch that represents a complete window — a statement import.
 *
 * Occurrence indices count from 0 within the batch, so:
 *   - two identical purchases in one statement take indices 0 and 1 and both survive
 *   - re-importing that statement regenerates 0 and 1, the upsert matches, nothing doubles
 *   - an overlapping statement regenerates the same indices for the shared rows, so they collapse
 *   - a genuine third purchase appears as a third row in a later statement and takes index 2
 *
 * Crucially this does NOT consult what is already stored. Whether an identical
 * incoming row is a re-import or a new purchase cannot be decided from the row —
 * it depends on how it arrived. Treating a whole-window import as authoritative
 * for its window is what makes the arithmetic work.
 */
export function buildImportKeys(accountId: string, rows: ParsedTransaction[]): string[] {
  const nextIndex = new Map<string, number>()

  return rows.map(row => {
    // A bank-supplied reference is authoritative and immune to reformatting.
    if (row.external_id) return sha(`${accountId}|ext|${row.external_id}`)

    const group = groupKey(accountId, row)
    const i = nextIndex.get(group) ?? 0
    nextIndex.set(group, i + 1)
    return sha(`${group}|${i}`)
  })
}

/**
 * The key for a single transaction added by hand.
 *
 * A manual addition is an assertion that this purchase happened *in addition* to
 * what is on record, so it takes the next free index rather than colliding with
 * an identical stored row. `storedKeysForGroup` is the set of keys already held
 * for this exact group.
 */
export function buildAppendKey(
  accountId: string,
  row: ParsedTransaction,
  storedKeysForGroup: ReadonlySet<string>,
): string {
  if (row.external_id) return sha(`${accountId}|ext|${row.external_id}`)

  const group = groupKey(accountId, row)
  let i = 0
  while (storedKeysForGroup.has(sha(`${group}|${i}`))) i++
  return sha(`${group}|${i}`)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/lib/money/dedupe-key.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/money/dedupe-key.ts __tests__/lib/money/dedupe-key.test.ts
git commit -m "feat: dedupe keys preserving genuine repeat transactions

The key includes an occurrence index within its group, so two identical
same-day purchases are both kept while a re-uploaded or overlapping statement
still collapses."
```

---

## Task 4: Categorisation

**Files:**
- Create: `lib/money/categorise.ts`
- Test: `__tests__/lib/money/categorise.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { applyRules, type Categorisable } from '@/lib/money/categorise'
import type { MoneyCategoryRule } from '@/lib/money/spending-types'

const rule = (over: Partial<MoneyCategoryRule> & { pattern: string; category_id: string }):
  MoneyCategoryRule => ({
  id: over.pattern, user_id: 'u', match_type: 'contains', priority: 100,
  created_at: '2026-01-01T00:00:00Z', ...over,
})

const txn = (description: string, over: Partial<Categorisable> = {}): Categorisable => ({
  description, category_id: null, category_source: null, ...over,
})

describe('applyRules', () => {
  it('assigns a category on a contains match', () => {
    const r = applyRules([txn('TESCO STORES 3421')], [rule({ pattern: 'tesco', category_id: 'groceries' })])
    expect(r[0]).toMatchObject({ category_id: 'groceries', category_source: 'rule' })
  })

  it('is case insensitive', () => {
    const r = applyRules([txn('tesco stores')], [rule({ pattern: 'TESCO', category_id: 'groceries' })])
    expect(r[0].category_id).toBe('groceries')
  })

  it('respects priority order, lowest first', () => {
    const r = applyRules([txn('TESCO PETROL STATION')], [
      rule({ pattern: 'tesco', category_id: 'groceries', priority: 200 }),
      rule({ pattern: 'petrol', category_id: 'fuel', priority: 10 }),
    ])
    expect(r[0].category_id).toBe('fuel')
  })

  it('stops at the first match', () => {
    const r = applyRules([txn('TESCO')], [
      rule({ pattern: 'tesco', category_id: 'first', priority: 1 }),
      rule({ pattern: 'tesco', category_id: 'second', priority: 2 }),
    ])
    expect(r[0].category_id).toBe('first')
  })

  it('supports an exact match type', () => {
    const rules = [rule({ pattern: 'RENT', category_id: 'housing', match_type: 'exact' })]
    expect(applyRules([txn('RENT')], rules)[0].category_id).toBe('housing')
    expect(applyRules([txn('RENT PAYMENT')], rules)[0].category_id).toBeNull()
  })

  it('supports a regex match type', () => {
    const rules = [rule({ pattern: '^SALARY \\d+$', category_id: 'salary', match_type: 'regex' })]
    expect(applyRules([txn('SALARY 4471')], rules)[0].category_id).toBe('salary')
    expect(applyRules([txn('MY SALARY 4471')], rules)[0].category_id).toBeNull()
  })

  it('ignores an invalid regex rather than throwing', () => {
    // A user-typed pattern can be malformed; one bad rule must not break an
    // entire import.
    const r = applyRules([txn('ANYTHING')], [rule({ pattern: '([', category_id: 'x', match_type: 'regex' })])
    expect(r[0].category_id).toBeNull()
  })

  it('never overwrites a manual category', () => {
    // A correction the user made by hand is the most reliable signal there is.
    const r = applyRules(
      [txn('TESCO', { category_id: 'chosen-by-hand', category_source: 'manual' })],
      [rule({ pattern: 'tesco', category_id: 'groceries' })],
    )
    expect(r[0]).toMatchObject({ category_id: 'chosen-by-hand', category_source: 'manual' })
  })

  it('does overwrite an earlier rule or AI assignment', () => {
    const r = applyRules(
      [txn('TESCO', { category_id: 'old', category_source: 'ai' })],
      [rule({ pattern: 'tesco', category_id: 'groceries' })],
    )
    expect(r[0]).toMatchObject({ category_id: 'groceries', category_source: 'rule' })
  })

  it('leaves an unmatched transaction uncategorised', () => {
    const r = applyRules([txn('MYSTERY MERCHANT')], [rule({ pattern: 'tesco', category_id: 'g' })])
    expect(r[0]).toMatchObject({ category_id: null, category_source: null })
  })

  it('handles an empty rule set', () => {
    expect(applyRules([txn('ANYTHING')], [])[0].category_id).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/lib/money/categorise.test.ts`
Expected: FAIL — "Cannot find module '@/lib/money/categorise'".

- [ ] **Step 3: Implement**

```ts
import type { CategorySource, MoneyCategoryRule } from './spending-types'

export interface Categorisable {
  description: string
  category_id: string | null
  category_source: CategorySource | null
}

function matches(rule: MoneyCategoryRule, description: string): boolean {
  const d = description.toLowerCase()
  const p = rule.pattern.toLowerCase()

  if (rule.match_type === 'exact') return d.trim() === p.trim()
  if (rule.match_type === 'contains') return d.includes(p)

  // A user-typed regex can be malformed. One bad rule must not abort an entire
  // import, so treat an invalid pattern as simply not matching.
  try {
    return new RegExp(rule.pattern, 'i').test(description)
  } catch {
    return false
  }
}

/**
 * Applies categorisation rules in priority order, first match winning.
 *
 * A `manual` category is never touched: a correction the user made by hand
 * outranks anything a rule or the model infers, and silently reverting it would
 * destroy the one signal in the system that is known to be right.
 */
export function applyRules<T extends Categorisable>(
  transactions: T[],
  rules: MoneyCategoryRule[],
): T[] {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority)

  return transactions.map(txn => {
    if (txn.category_source === 'manual') return txn

    const hit = ordered.find(r => matches(r, txn.description))
    if (!hit) return { ...txn, category_id: null, category_source: null }

    return { ...txn, category_id: hit.category_id, category_source: 'rule' as const }
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/lib/money/categorise.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/money/categorise.ts __tests__/lib/money/categorise.test.ts
git commit -m "feat: rule-based categorisation that never overwrites a manual choice"
```

---

## Task 5: Spending summary

**Files:**
- Create: `lib/money/spending-summary.ts`
- Test: `__tests__/lib/money/spending-summary.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { buildSpendingSummary } from '@/lib/money/spending-summary'
import type { MoneyCategory, MoneyTransaction } from '@/lib/money/spending-types'
import type { MoneyAccount } from '@/lib/money/types'

const cat = (id: string, name: string, kind: MoneyCategory['kind']): MoneyCategory =>
  ({ id, user_id: 'u', name, kind, sort_order: 0, created_at: '2026-01-01T00:00:00Z' })

const acct = (id: string, currency = 'GBP'): MoneyAccount => ({
  id, user_id: 'u', name: id, institution: null, kind: 'current', currency,
  opened_date: null, closed_date: null, status: 'active', notes: null,
  created_at: '2026-01-01T00:00:00Z',
})

const txn = (
  amount: number, category_id: string | null, txn_date = '2026-02-10', account_id = 'a',
): MoneyTransaction => ({
  id: `${amount}-${category_id}-${txn_date}`, user_id: 'u', account_id, txn_date,
  description: 'x', merchant: null, amount, category_id,
  category_source: category_id ? 'rule' : null, document_id: null,
  external_id: null, dedupe_key: `${amount}-${category_id}-${txn_date}`,
  notes: null, created_at: '2026-02-10T00:00:00Z',
})

const CATS = [
  cat('groceries', 'Groceries', 'spending'),
  cat('salary', 'Salary', 'income'),
  cat('transfer', 'Transfer', 'transfer'),
]

describe('buildSpendingSummary', () => {
  it('returns zeros, not NaN, for an empty month', () => {
    const r = buildSpendingSummary([], CATS, [acct('a')], '2026-02')
    expect(r).toMatchObject({ totalOut: 0, totalIn: 0, net: 0, uncategorisedCount: 0 })
    expect(r.byCategory).toEqual([])
  })

  it('totals money out as a positive figure', () => {
    const r = buildSpendingSummary([txn(-50, 'groceries')], CATS, [acct('a')], '2026-02')
    expect(r.totalOut).toBe(50)
    expect(r.totalIn).toBe(0)
    expect(r.net).toBe(-50)
  })

  it('excludes transfers from both totals', () => {
    // £500 out of current and into savings is not £500 of spending, nor income.
    const r = buildSpendingSummary(
      [txn(-500, 'transfer'), txn(500, 'transfer', '2026-02-10', 'b'), txn(-20, 'groceries')],
      CATS, [acct('a'), acct('b')], '2026-02',
    )
    expect(r.totalOut).toBe(20)
    expect(r.totalIn).toBe(0)
  })

  it('counts income separately', () => {
    const r = buildSpendingSummary([txn(2000, 'salary'), txn(-50, 'groceries')], CATS, [acct('a')], '2026-02')
    expect(r.totalIn).toBe(2000)
    expect(r.totalOut).toBe(50)
    expect(r.net).toBe(1950)
  })

  it('reports uncategorised count and value separately', () => {
    const r = buildSpendingSummary([txn(-30, null), txn(-50, 'groceries')], CATS, [acct('a')], '2026-02')
    expect(r.uncategorisedCount).toBe(1)
    expect(r.uncategorisedValue).toBe(30)
  })

  it('includes uncategorised spending in totalOut', () => {
    // Excluding it would understate the month while looking complete.
    const r = buildSpendingSummary([txn(-30, null)], CATS, [acct('a')], '2026-02')
    expect(r.totalOut).toBe(30)
  })

  it('includes both month boundary days', () => {
    const r = buildSpendingSummary(
      [txn(-1, 'groceries', '2026-02-01'), txn(-2, 'groceries', '2026-02-28')],
      CATS, [acct('a')], '2026-02',
    )
    expect(r.totalOut).toBe(3)
  })

  it('excludes other months', () => {
    const r = buildSpendingSummary(
      [txn(-1, 'groceries', '2026-01-31'), txn(-2, 'groceries', '2026-03-01')],
      CATS, [acct('a')], '2026-02',
    )
    expect(r.totalOut).toBe(0)
  })

  it('sorts categories by spend, largest first', () => {
    const r = buildSpendingSummary(
      [txn(-10, 'groceries'), txn(-90, 'salary')], // salary used as a spend here deliberately
      [cat('groceries', 'Groceries', 'spending'), cat('salary', 'Other', 'spending')],
      [acct('a')], '2026-02',
    )
    expect(r.byCategory[0].total).toBe(90)
  })

  it('refuses to sum across currencies', () => {
    const r = buildSpendingSummary(
      [txn(-10, 'groceries', '2026-02-10', 'a'), txn(-10, 'groceries', '2026-02-10', 'b')],
      CATS, [acct('a', 'GBP'), acct('b', 'USD')], '2026-02',
    )
    expect(r.currencyWarning).toMatch(/GBP/)
    expect(r.totalOut).toBe(0)
  })

  it('does not drift when summing pence amounts', () => {
    const rows = Array.from({ length: 10 }, (_, i) => txn(-0.1, 'groceries', `2026-02-0${i + 1}`))
    const r = buildSpendingSummary(rows, CATS, [acct('a')], '2026-02')
    expect(r.totalOut).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/lib/money/spending-summary.test.ts`
Expected: FAIL — "Cannot find module '@/lib/money/spending-summary'".

- [ ] **Step 3: Implement**

```ts
import type { MoneyCategory, MoneyTransaction } from './spending-types'
import type { MoneyAccount } from './types'

export interface CategoryTotal {
  categoryId: string | null
  name: string
  total: number
  share: number
}

export interface SpendingSummary {
  month: string
  totalOut: number
  totalIn: number
  net: number
  byCategory: CategoryTotal[]
  uncategorisedCount: number
  uncategorisedValue: number
  transactionCount: number
  currencyWarning: string | null
}

const pence = (n: number) => Math.round(n * 100)

/**
 * Aggregates one month's transactions.
 *
 * Transfers are excluded from both totals: a move between the user's own
 * accounts appears twice, and counting it would inflate spending and income
 * simultaneously, making every figure untrustworthy.
 *
 * Uncategorised spending is included in totalOut but ALSO reported separately.
 * Excluding it would understate the month while looking complete; hiding the
 * count would let an incomplete picture read as a finished one.
 *
 * @param month YYYY-MM
 */
export function buildSpendingSummary(
  transactions: MoneyTransaction[],
  categories: MoneyCategory[],
  accounts: MoneyAccount[],
  month: string,
): SpendingSummary {
  const empty: SpendingSummary = {
    month, totalOut: 0, totalIn: 0, net: 0, byCategory: [],
    uncategorisedCount: 0, uncategorisedValue: 0, transactionCount: 0,
    currencyWarning: null,
  }

  const inMonth = transactions.filter(t => t.txn_date.slice(0, 7) === month)
  if (inMonth.length === 0) return empty

  // Same guard as net worth: a total spanning currencies would be confidently
  // wrong, and FX conversion is out of scope.
  const accountsUsed = new Set(inMonth.map(t => t.account_id))
  const currencies = [...new Set(
    accounts.filter(a => accountsUsed.has(a.id)).map(a => a.currency),
  )].sort()
  if (currencies.length > 1) {
    return {
      ...empty,
      transactionCount: inMonth.length,
      currencyWarning:
        `This month spans ${currencies.join(', ')}. Totals need a single currency — ` +
        `filter to one account, or track each currency separately.`,
    }
  }

  const byId = new Map(categories.map(c => [c.id, c]))
  const kindOf = (t: MoneyTransaction) =>
    t.category_id ? byId.get(t.category_id)?.kind ?? 'spending' : 'spending'

  let outP = 0
  let inP = 0
  let uncatCount = 0
  let uncatP = 0
  const catTotals = new Map<string | null, number>()

  for (const t of inMonth) {
    const kind = kindOf(t)
    if (kind === 'transfer') continue

    const p = pence(Number(t.amount))

    if (p < 0) {
      outP += -p
      catTotals.set(t.category_id, (catTotals.get(t.category_id) ?? 0) + -p)
      if (!t.category_id) { uncatCount++; uncatP += -p }
    } else {
      inP += p
    }
  }

  const byCategory: CategoryTotal[] = [...catTotals.entries()]
    .map(([categoryId, p]) => ({
      categoryId,
      name: categoryId ? byId.get(categoryId)?.name ?? 'Unknown' : 'Uncategorised',
      total: p / 100,
      share: outP > 0 ? p / outP : 0,
    }))
    .sort((a, b) => b.total - a.total)

  return {
    month,
    totalOut: outP / 100,
    totalIn: inP / 100,
    net: (inP - outP) / 100,
    byCategory,
    uncategorisedCount: uncatCount,
    uncategorisedValue: uncatP / 100,
    transactionCount: inMonth.length,
    currencyWarning: null,
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/lib/money/spending-summary.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/money/spending-summary.ts __tests__/lib/money/spending-summary.test.ts
git commit -m "feat: monthly spending summary excluding transfers

Transfers are dropped from both totals, since a move between own accounts
appears twice and would inflate spending and income at once. Uncategorised
spending counts toward the total but is also reported separately, so an
incomplete month cannot read as a complete one."
```

---

## Task 6: Reconciliation

**Files:**
- Create: `lib/money/reconcile.ts`
- Test: `__tests__/lib/money/reconcile.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { reconcileAccount } from '@/lib/money/reconcile'
import type { MoneyBalance } from '@/lib/money/types'
import type { MoneyTransaction } from '@/lib/money/spending-types'

const bal = (as_of: string, balance: number): MoneyBalance => ({
  id: as_of, user_id: 'u', account_id: 'a', as_of, balance,
  source: 'manual', document_id: null, notes: null, created_at: `${as_of}T00:00:00Z`,
})

const txn = (txn_date: string, amount: number): MoneyTransaction => ({
  id: `${txn_date}-${amount}`, user_id: 'u', account_id: 'a', txn_date,
  description: 'x', merchant: null, amount, category_id: null, category_source: null,
  document_id: null, external_id: null, dedupe_key: `${txn_date}-${amount}`,
  notes: null, created_at: `${txn_date}T00:00:00Z`,
})

describe('reconcileAccount', () => {
  it('returns no intervals when there is only one snapshot', () => {
    expect(reconcileAccount([bal('2026-01-31', 100)], [])).toEqual([])
  })

  it('returns no intervals when there are no snapshots', () => {
    expect(reconcileAccount([], [txn('2026-02-01', -10)])).toEqual([])
  })

  it('passes when transactions explain the balance change', () => {
    const r = reconcileAccount(
      [bal('2026-01-31', 1000), bal('2026-02-28', 900)],
      [txn('2026-02-10', -60), txn('2026-02-20', -40)],
    )
    expect(r).toHaveLength(1)
    expect(r[0].ok).toBe(true)
    expect(r[0].discrepancy).toBe(0)
  })

  it('flags a missing transaction and states the gap', () => {
    const r = reconcileAccount(
      [bal('2026-01-31', 1000), bal('2026-02-28', 900)],
      [txn('2026-02-10', -60)],
    )
    expect(r[0].ok).toBe(false)
    expect(r[0].discrepancy).toBe(-40)
  })

  it('tolerates a discrepancy under a penny', () => {
    const r = reconcileAccount(
      [bal('2026-01-31', 1000), bal('2026-02-28', 999.995)],
      [txn('2026-02-10', -0.005)],
    )
    expect(r[0].ok).toBe(true)
  })

  it('excludes the opening snapshot date and includes the closing one', () => {
    // A transaction dated on the opening snapshot day is already reflected in
    // that balance, so counting it again would invent a discrepancy.
    const r = reconcileAccount(
      [bal('2026-01-31', 1000), bal('2026-02-28', 900)],
      [txn('2026-01-31', -999), txn('2026-02-28', -100)],
    )
    expect(r[0].ok).toBe(true)
  })

  it('handles money in as well as out', () => {
    const r = reconcileAccount(
      [bal('2026-01-31', 1000), bal('2026-02-28', 1500)],
      [txn('2026-02-10', 500)],
    )
    expect(r[0].ok).toBe(true)
  })

  it('reports one interval per consecutive snapshot pair', () => {
    const r = reconcileAccount(
      [bal('2026-01-31', 100), bal('2026-02-28', 100), bal('2026-03-31', 100)],
      [],
    )
    expect(r).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/lib/money/reconcile.test.ts`
Expected: FAIL — "Cannot find module '@/lib/money/reconcile'".

- [ ] **Step 3: Implement**

```ts
import type { MoneyBalance } from './types'
import type { MoneyTransaction } from './spending-types'

export interface ReconcileInterval {
  from: string
  to: string
  balanceChange: number
  transactionSum: number
  /** transactionSum − balanceChange. Negative means transactions are missing. */
  discrepancy: number
  ok: boolean
}

const pence = (n: number) => Math.round(n * 100)

/**
 * Checks whether imported transactions explain the change between balance
 * snapshots.
 *
 * Snapshots remain the source of truth for net worth; this never corrects
 * anything. Its only job is to make a gap visible — a missed statement page is
 * otherwise invisible, and the spending figures would simply be quietly low.
 *
 * The opening snapshot's own date is excluded and the closing date included: a
 * transaction on the opening day is already reflected in that balance, so
 * counting it again would invent a discrepancy that does not exist.
 */
export function reconcileAccount(
  balances: MoneyBalance[],
  transactions: MoneyTransaction[],
): ReconcileInterval[] {
  const snapshots = [...balances].sort((a, b) => a.as_of.localeCompare(b.as_of))
  if (snapshots.length < 2) return []

  const out: ReconcileInterval[] = []

  for (let i = 1; i < snapshots.length; i++) {
    const from = snapshots[i - 1]
    const to = snapshots[i]

    const changeP = pence(Number(to.balance)) - pence(Number(from.balance))
    const sumP = transactions
      .filter(t => t.txn_date > from.as_of && t.txn_date <= to.as_of)
      .reduce((acc, t) => acc + pence(Number(t.amount)), 0)

    const discrepancyP = sumP - changeP

    out.push({
      from: from.as_of,
      to: to.as_of,
      balanceChange: changeP / 100,
      transactionSum: sumP / 100,
      discrepancy: discrepancyP / 100,
      // Under a penny is rounding, not a missing transaction.
      ok: Math.abs(discrepancyP) < 1,
    })
  }

  return out
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/lib/money/reconcile.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/money/reconcile.ts __tests__/lib/money/reconcile.test.ts
git commit -m "feat: reconcile transaction sums against balance changes

Warns only — never corrects. A missed statement page is otherwise invisible and
would just make the spending figures quietly low."
```

---

## Task 7: Transaction CSV parser

**Files:**
- Create: `lib/money/parse-transaction-csv.ts`
- Test: `__tests__/lib/money/parse-transaction-csv.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { parseTransactionCsv } from '@/lib/money/parse-transaction-csv'

describe('parseTransactionCsv', () => {
  it('parses a single signed amount column', () => {
    const r = parseTransactionCsv('Date,Description,Amount\n2026-02-04,PRET,-3.20')
    expect(r.rows).toEqual([
      { txn_date: '2026-02-04', description: 'PRET', amount: -3.2, external_id: null },
    ])
    expect(r.errors).toEqual([])
  })

  it('normalises separate debit and credit columns', () => {
    const r = parseTransactionCsv([
      'Date,Description,Debit,Credit',
      '2026-02-04,PRET,3.20,',
      '2026-02-05,SALARY,,2000.00',
    ].join('\n'))
    expect(r.rows.map(x => x.amount)).toEqual([-3.2, 2000])
  })

  it('reads a bracketed amount as money out', () => {
    const r = parseTransactionCsv('Date,Description,Amount\n2026-02-04,PRET,(3.20)')
    expect(r.rows[0].amount).toBe(-3.2)
  })

  it('applies a DR/CR type column', () => {
    const r = parseTransactionCsv([
      'Date,Description,Amount,Type',
      '2026-02-04,PRET,3.20,DR',
      '2026-02-05,SALARY,2000.00,CR',
    ].join('\n'))
    expect(r.rows.map(x => x.amount)).toEqual([-3.2, 2000])
  })

  it('reads DD/MM/YYYY the British way round', () => {
    const r = parseTransactionCsv('Date,Description,Amount\n03/02/2026,PRET,-1')
    expect(r.rows[0].txn_date).toBe('2026-02-03')
  })

  it('reads the calendar day from local parts, not UTC', () => {
    const r = parseTransactionCsv('Date,Description,Amount\n"February 4, 2026",PRET,-1')
    expect(r.rows[0].txn_date).toBe('2026-02-04')
  })

  it('picks up a bank reference column when present', () => {
    const r = parseTransactionCsv('Date,Description,Amount,Reference\n2026-02-04,PRET,-1,TXN-99')
    expect(r.rows[0].external_id).toBe('TXN-99')
  })

  it('ignores a running balance column', () => {
    // Mistaking the balance for the amount would corrupt every figure.
    const r = parseTransactionCsv('Date,Description,Amount,Balance\n2026-02-04,PRET,-3.20,996.80')
    expect(r.rows[0].amount).toBe(-3.2)
  })

  it('reports a missing required column', () => {
    const r = parseTransactionCsv('Description,Amount\nPRET,-1')
    expect(r.rows).toEqual([])
    expect(r.errors[0]).toMatch(/date/i)
  })

  it('keeps good rows and reports bad ones', () => {
    const r = parseTransactionCsv([
      'Date,Description,Amount',
      '2026-02-04,PRET,-1',
      'rubbish,PRET,-1',
      '2026-02-06,PRET,-2',
    ].join('\n'))
    expect(r.rows).toHaveLength(2)
    expect(r.errors).toHaveLength(1)
  })

  it('skips a zero-amount row without erroring', () => {
    const r = parseTransactionCsv('Date,Description,Amount\n2026-02-04,BALANCE CARRIED,0.00')
    expect(r.rows).toEqual([])
    expect(r.errors).toEqual([])
  })

  it('handles quoted descriptions containing commas', () => {
    const r = parseTransactionCsv('Date,Description,Amount\n2026-02-04,"SMITH, J LTD",-1')
    expect(r.rows[0].description).toBe('SMITH, J LTD')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/lib/money/parse-transaction-csv.test.ts`
Expected: FAIL — "Cannot find module '@/lib/money/parse-transaction-csv'".

- [ ] **Step 3: Implement**

```ts
import type { ParsedTransaction } from './spending-types'

export interface TransactionCsvResult {
  rows: ParsedTransaction[]
  errors: string[]
}

/** Minimal RFC-4180 splitter: quoted fields and escaped quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map(s => s.trim())
}

/**
 * Normalises a date cell to YYYY-MM-DD.
 *
 * Forms like "February 4, 2026" parse to LOCAL midnight, so the calendar day is
 * read from local parts. Reading UTC parts shifts every date back one day in any
 * timezone ahead of UTC — already hit once in parse-pill-csv.ts.
 */
function toIsoDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  const slash = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s)
  if (slash) {
    const [, d, m, y] = slash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const parsed = new Date(s)
  if (Number.isNaN(parsed.getTime())) return null
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
}

/** Returns the magnitude, and whether brackets marked it as an outgoing. */
function toAmount(raw: string): { value: number; bracketed: boolean } | null {
  let s = raw.trim()
  if (!s) return null
  let bracketed = false
  const paren = /^\((.*)\)$/.exec(s)
  if (paren) { s = paren[1]; bracketed = true }
  s = s.replace(/[£$€,\s]/g, '')
  if (s === '' || s === '-') return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return { value: Math.round(n * 100) / 100, bracketed }
}

const ALIASES: Record<string, string[]> = {
  date: ['date', 'transaction date', 'txn date', 'posted', 'value date'],
  description: ['description', 'details', 'narrative', 'reference description', 'merchant', 'payee'],
  amount: ['amount', 'value', 'transaction amount'],
  debit: ['debit', 'paid out', 'money out', 'withdrawal', 'withdrawn'],
  credit: ['credit', 'paid in', 'money in', 'deposit'],
  type: ['type', 'dr/cr', 'debit/credit'],
  reference: ['reference', 'transaction id', 'transaction reference', 'id'],
  // Recognised only so it is never mistaken for the amount.
  balance: ['balance', 'running balance', 'closing balance'],
}

export function parseTransactionCsv(text: string): TransactionCsvResult {
  const errors: string[] = []
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) return { rows: [], errors: ['The file has no data rows.'] }

  const header = splitCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[_-]+/g, ' ').trim())
  const col = (key: string) => header.findIndex(h => ALIASES[key].includes(h))

  const iDate = col('date')
  const iDesc = col('description')
  const iAmount = col('amount')
  const iDebit = col('debit')
  const iCredit = col('credit')
  const iType = col('type')
  const iRef = col('reference')

  if (iDate === -1) errors.push(`Could not find a date column. Found: ${header.join(', ')}`)
  if (iDesc === -1) errors.push(`Could not find a description column. Found: ${header.join(', ')}`)
  if (iAmount === -1 && iDebit === -1 && iCredit === -1) {
    errors.push(`Could not find an amount, debit or credit column. Found: ${header.join(', ')}`)
  }
  if (errors.length) return { rows: [], errors }

  const rows: ParsedTransaction[] = []

  lines.slice(1).forEach((line, n) => {
    const cells = splitCsvLine(line)
    const lineNo = n + 2

    const txn_date = toIsoDate(cells[iDate] ?? '')
    if (!txn_date) { errors.push(`Row ${lineNo}: unreadable date "${cells[iDate] ?? ''}".`); return }

    const description = (cells[iDesc] ?? '').trim()
    if (!description) { errors.push(`Row ${lineNo}: no description.`); return }

    let amount: number | null = null

    // Separate debit/credit columns take precedence: when a file has both, the
    // column a value appears in is the direction, unambiguously.
    if (iDebit !== -1 || iCredit !== -1) {
      const dr = iDebit !== -1 ? toAmount(cells[iDebit] ?? '') : null
      const cr = iCredit !== -1 ? toAmount(cells[iCredit] ?? '') : null
      if (dr && dr.value !== 0) amount = -Math.abs(dr.value)
      else if (cr && cr.value !== 0) amount = Math.abs(cr.value)
    }

    if (amount === null && iAmount !== -1) {
      const a = toAmount(cells[iAmount] ?? '')
      if (!a) { errors.push(`Row ${lineNo}: unreadable amount "${cells[iAmount] ?? ''}".`); return }
      amount = a.bracketed ? -Math.abs(a.value) : a.value

      // A DR/CR column overrides the sign, since such files usually print
      // magnitudes only.
      const type = (cells[iType] ?? '').trim().toUpperCase()
      if (iType !== -1 && type) {
        if (type.startsWith('DR') || type === 'D') amount = -Math.abs(amount)
        if (type.startsWith('CR') || type === 'C') amount = Math.abs(amount)
      }
    }

    if (amount === null) { errors.push(`Row ${lineNo}: no amount.`); return }
    // Statement filler lines ("balance carried forward") carry zero and are not
    // transactions. Silently skipping is right; erroring would be noise.
    if (amount === 0) return

    rows.push({
      txn_date,
      description,
      amount,
      external_id: iRef !== -1 ? (cells[iRef] || '').trim() || null : null,
    })
  })

  return { rows, errors }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/lib/money/parse-transaction-csv.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/money/parse-transaction-csv.ts __tests__/lib/money/parse-transaction-csv.test.ts
git commit -m "feat: transaction CSV parser normalising every sign convention

Handles signed columns, separate debit/credit, bracketed negatives and DR/CR
type columns, and recognises a running-balance column purely so it is never
mistaken for the amount."
```

---

## Task 8: Transaction extraction from PDF and images

**Files:**
- Create: `lib/money/extract-transactions.ts`

Read `lib/money/extract.ts` first; this follows it, with two differences that matter (volume, and
running-balance columns).

- [ ] **Step 1: Write the extractor**

```ts
import Anthropic from '@anthropic-ai/sdk'
import type { ParsedTransaction } from './spending-types'

const client = new Anthropic()

const TOOL: Anthropic.Tool = {
  name: 'record_transactions',
  description: 'Record every transaction line visible in the statement.',
  input_schema: {
    type: 'object' as const,
    properties: {
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            txn_date: { type: 'string', description: 'YYYY-MM-DD.' },
            description: { type: 'string', description: 'The description exactly as printed.' },
            amount: { type: 'number', description: 'Magnitude only, always positive. Direction goes in `direction`.' },
            direction: { type: 'string', enum: ['out', 'in'], description: 'out = money left the account.' },
            external_id: { type: ['string', 'null'], description: "The bank's own reference, if printed." },
            confidence: { type: 'string', enum: ['high', 'low'] },
          },
          required: ['txn_date', 'description', 'amount', 'direction', 'external_id', 'confidence'],
        },
      },
      page_had_transactions: {
        type: 'boolean',
        description: 'False only if this document genuinely shows no transaction lines at all.',
      },
    },
    required: ['transactions', 'page_had_transactions'],
  },
}

const SYSTEM = `You read bank statements and extract every transaction line.

Rules:
- Give the amount as a POSITIVE magnitude and put the direction in \`direction\`. Never return a negative amount.
- Statements usually show a RUNNING BALANCE beside each row. That is not the transaction amount — never report it as one.
- Skip non-transaction lines: opening balance, closing balance, "balance carried forward", subtotals, page headers.
- Use the date printed against the row. If a row shows both a transaction date and a posting date, use the transaction date.
- Copy the description as printed; do not tidy or interpret it.
- Mark confidence 'low' if the amount, date or direction is unclear or cropped.
- Extract EVERY row you can see. A missed row silently loses spending history.`

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

export const isSupportedStatementMime = (mime: string) =>
  mime === 'application/pdf' || (IMAGE_TYPES as readonly string[]).includes(mime)

export interface ExtractionOutcome {
  rows: ParsedTransaction[]
  lowConfidence: ParsedTransaction[]
  /** Set when the model returned nothing but claimed the document has rows. */
  warning: string | null
}

export async function extractTransactions(
  file: { data: string; mediaType: string },
): Promise<ExtractionOutcome> {
  const isPdf = file.mediaType === 'application/pdf'

  const content: Anthropic.ContentBlockParam[] = [
    isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: (IMAGE_TYPES as readonly string[]).includes(file.mediaType)
              ? (file.mediaType as (typeof IMAGE_TYPES)[number])
              : 'image/png',
            data: file.data,
          },
        },
    { type: 'text', text: 'Extract every transaction line in this statement.' },
  ]

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    // A 20-page statement is easily 200+ rows; 2048 would truncate mid-list and
    // the loss would be invisible.
    max_tokens: 8192,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_transactions' },
    messages: [{ role: 'user', content }],
  })

  const block = res.content.find(b => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') {
    return { rows: [], lowConfidence: [], warning: 'The model returned no structured output.' }
  }

  const input = block.input as { transactions?: unknown[]; page_had_transactions?: boolean }
  const raw = input.transactions ?? []

  const rows: ParsedTransaction[] = []
  const lowConfidence: ParsedTransaction[] = []

  for (const r of raw) {
    const row = r as Record<string, unknown>
    const magnitude = Number(row.amount)
    const description = String(row.description ?? '').trim()
    const date = String(row.txn_date ?? '').slice(0, 10)
    if (!description || !Number.isFinite(magnitude) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (magnitude === 0) continue

    const parsed: ParsedTransaction = {
      txn_date: date,
      description,
      amount: row.direction === 'in' ? Math.abs(magnitude) : -Math.abs(magnitude),
      external_id: row.external_id ? String(row.external_id) : null,
    }
    if (row.confidence === 'high') rows.push(parsed)
    else lowConfidence.push(parsed)
  }

  // Distinguish "this document has no transactions" from "extraction failed".
  // Treating the second as the first is how a statement page goes missing
  // without anyone noticing.
  const warning = rows.length === 0 && lowConfidence.length === 0 && input.page_had_transactions
    ? 'The statement appears to contain transactions but none could be read. Try a clearer copy or split it into fewer pages.'
    : null

  return { rows, lowConfidence, warning }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add lib/money/extract-transactions.ts
git commit -m "feat: extract transactions from statements

Asks for magnitude plus direction rather than a signed number, warns the model
off running-balance columns, and distinguishes an empty statement from a failed
extraction so a lost page cannot pass as 'no transactions'."
```

---

## Task 8a: Category suggestions from Claude

Rules alone leave every new merchant uncategorised, which on a first import means everything. This is
the pass that makes the first import useful — and every suggestion is returned as a **proposed rule**,
so accepting it once makes all future imports deterministic and free.

**Files:**
- Create: `lib/money/suggest-categories.ts`

- [ ] **Step 1: Write the suggester**

```ts
import Anthropic from '@anthropic-ai/sdk'
import type { MoneyCategory } from './spending-types'

const client = new Anthropic()

export interface CategorySuggestion {
  description: string
  category_id: string
  /** A `contains` pattern that would match this and similar descriptions. */
  suggested_pattern: string
}

const TOOL: Anthropic.Tool = {
  name: 'assign_categories',
  description: 'Assign a category to each transaction description.',
  input_schema: {
    type: 'object' as const,
    properties: {
      assignments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'The description, copied exactly.' },
            category_name: { type: 'string', description: 'Must be one of the categories offered.' },
            suggested_pattern: {
              type: 'string',
              description:
                'The shortest distinctive fragment of the description that would identify this ' +
                'merchant in future, e.g. "TESCO" for "TESCO STORES 3421 REF 99". Omit reference ' +
                'numbers, dates and amounts.',
            },
            confidence: { type: 'string', enum: ['high', 'low'] },
          },
          required: ['description', 'category_name', 'suggested_pattern', 'confidence'],
        },
      },
    },
    required: ['assignments'],
  },
}

const SYSTEM = `You categorise UK bank transaction descriptions.

Rules:
- Use ONLY the category names offered. Never invent one.
- A transfer between the person's own accounts (descriptions mentioning transfer, own name, or a
  savings/ISA pot) must get the transfer category, never a spending one.
- Money received (salary, interest, refunds) gets an income category.
- suggested_pattern must be a fragment that appears literally in the description, with reference
  numbers, dates and amounts removed, so it will match the same merchant next month.
- Mark confidence 'low' when the merchant is genuinely unclear. A wrong category is worse than an
  uncategorised one, because it silently distorts a total instead of being visibly missing.`

/**
 * Suggests categories for descriptions no rule matched.
 *
 * Batched into one call rather than one per transaction — a statement can hold
 * hundreds of rows, and per-row calls would be slow and expensive. Only distinct
 * descriptions are sent, since a merchant appearing twenty times needs deciding
 * once.
 *
 * Returns only high-confidence assignments. Low confidence is deliberately
 * dropped so the row stays visibly uncategorised.
 */
export async function suggestCategories(
  descriptions: string[],
  categories: MoneyCategory[],
): Promise<CategorySuggestion[]> {
  const distinct = [...new Set(descriptions.map(d => d.trim()).filter(Boolean))]
  if (distinct.length === 0 || categories.length === 0) return []

  const byName = new Map(categories.map(c => [c.name.toLowerCase(), c]))
  const offered = categories.map(c => `${c.name} (${c.kind})`).join('\n')

  // Chunked so a very long statement cannot exceed the output ceiling and get
  // truncated mid-list.
  const CHUNK = 80
  const out: CategorySuggestion[] = []

  for (let i = 0; i < distinct.length; i += CHUNK) {
    const batch = distinct.slice(i, i + CHUNK)

    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'assign_categories' },
      messages: [{
        role: 'user',
        content:
          `Available categories:\n${offered}\n\n` +
          `Descriptions:\n${batch.map(d => `- ${d}`).join('\n')}`,
      }],
    })

    const block = res.content.find(b => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') continue

    const rows = (block.input as { assignments?: unknown[] }).assignments ?? []
    for (const r of rows) {
      const row = r as Record<string, unknown>
      if (row.confidence !== 'high') continue

      const category = byName.get(String(row.category_name ?? '').toLowerCase())
      const description = String(row.description ?? '').trim()
      const pattern = String(row.suggested_pattern ?? '').trim()
      if (!category || !description || !pattern) continue

      // The pattern must actually occur in the description, or the rule it
      // becomes would never fire and the user would be left wondering why.
      if (!description.toLowerCase().includes(pattern.toLowerCase())) continue

      out.push({ description, category_id: category.id, suggested_pattern: pattern })
    }
  }

  return out
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add lib/money/suggest-categories.ts
git commit -m "feat: batched category suggestions returned as proposed rules

Only distinct descriptions are sent and only high-confidence assignments are
kept, so an unclear merchant stays visibly uncategorised rather than being
quietly filed somewhere wrong. Each suggestion carries a pattern verified to
occur in the description, so the rule it becomes will actually fire."
```

---

## Task 9: Categories and rules endpoints

**Files:**
- Create: `app/api/money/categories/route.ts`
- Create: `app/api/money/categories/[id]/route.ts`
- Create: `app/api/money/rules/route.ts`
- Create: `app/api/money/rules/[id]/route.ts`

- [ ] **Step 1: Write the categories collection route**

`app/api/money/categories/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CATEGORY_KINDS, DEFAULT_CATEGORIES } from '@/lib/money/spending-types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('money_categories')
    .select('*')
    .order('sort_order')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Seed the starter set on first use, so the list lives with the code that
  // depends on it rather than in a migration that cannot be revised.
  if ((data ?? []).length === 0) {
    const seeded = DEFAULT_CATEGORIES.map((c, i) => ({
      user_id: user.id, name: c.name, kind: c.kind, sort_order: i,
    }))
    const { data: created, error: seedErr } = await supabase
      .from('money_categories')
      .insert(seeded)
      .select()
    if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 })
    return NextResponse.json(created ?? [])
  }

  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  if (!CATEGORY_KINDS.includes(body.kind)) {
    return NextResponse.json({ error: `kind must be one of: ${CATEGORY_KINDS.join(', ')}` }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('money_categories')
    .insert({ user_id: user.id, name, kind: body.kind, sort_order: Number(body.sort_order) || 0 })
    .select()
    .single()

  if (error) {
    const dup = error.code === '23505' || /duplicate key/i.test(error.message)
    return NextResponse.json(
      { error: dup ? 'A category with that name already exists.' : error.message },
      { status: dup ? 409 : 500 },
    )
  }
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Write the category item route**

`app/api/money/categories/[id]/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CATEGORY_KINDS } from '@/lib/money/spending-types'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 })
    patch.name = name
  }
  if (body.kind !== undefined) {
    if (!CATEGORY_KINDS.includes(body.kind)) {
      return NextResponse.json({ error: `kind must be one of: ${CATEGORY_KINDS.join(', ')}` }, { status: 400 })
    }
    patch.kind = body.kind
  }
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('money_categories').update(patch).eq('id', id).select().maybeSingle()
  if (error) {
    const dup = error.code === '23505' || /duplicate key/i.test(error.message)
    return NextResponse.json(
      { error: dup ? 'A category with that name already exists.' : error.message },
      { status: dup ? 409 : 500 },
    )
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Transactions keep their history with category_id set to null (schema: on
  // delete set null); the category's rules cascade away, being unusable debris.
  const { count } = await supabase
    .from('money_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)

  const { error, count: deleted } = await supabase
    .from('money_categories').delete({ count: 'exact' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ deleted: true, transactions_uncategorised: count ?? 0 })
}
```

- [ ] **Step 3: Write the rules routes**

`app/api/money/rules/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { MATCH_TYPES } from '@/lib/money/spending-types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('money_category_rules').select('*').order('priority')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const pattern = String(body.pattern ?? '').trim()
  if (!pattern) return NextResponse.json({ error: 'A pattern is required.' }, { status: 400 })
  if (!MATCH_TYPES.includes(body.match_type)) {
    return NextResponse.json({ error: `match_type must be one of: ${MATCH_TYPES.join(', ')}` }, { status: 400 })
  }
  if (!body.category_id) {
    return NextResponse.json({ error: 'category_id is required.' }, { status: 400 })
  }
  // Reject a malformed regex at creation rather than letting it silently never
  // match every time an import runs.
  if (body.match_type === 'regex') {
    try { new RegExp(pattern) }
    catch { return NextResponse.json({ error: 'That is not a valid regular expression.' }, { status: 400 }) }
  }

  const { data, error } = await supabase
    .from('money_category_rules')
    .insert({
      user_id: user.id, pattern, match_type: body.match_type,
      category_id: body.category_id, priority: Number(body.priority) || 100,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

`app/api/money/rules/[id]/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { MATCH_TYPES } from '@/lib/money/spending-types'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.pattern !== undefined) {
    const p = String(body.pattern).trim()
    if (!p) return NextResponse.json({ error: 'Pattern cannot be empty.' }, { status: 400 })
    patch.pattern = p
  }
  if (body.match_type !== undefined) {
    if (!MATCH_TYPES.includes(body.match_type)) {
      return NextResponse.json({ error: `match_type must be one of: ${MATCH_TYPES.join(', ')}` }, { status: 400 })
    }
    patch.match_type = body.match_type
  }
  if (body.category_id !== undefined) patch.category_id = body.category_id
  if (body.priority !== undefined) patch.priority = Number(body.priority) || 100

  const effectiveType = (patch.match_type ?? body.match_type) as string | undefined
  const effectivePattern = (patch.pattern ?? undefined) as string | undefined
  if (effectiveType === 'regex' && effectivePattern) {
    try { new RegExp(effectivePattern) }
    catch { return NextResponse.json({ error: 'That is not a valid regular expression.' }, { status: 400 }) }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('money_category_rules').update(patch).eq('id', id).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error, count } = await supabase
    .from('money_category_rules').delete({ count: 'exact' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/api/money/categories app/api/money/rules
git commit -m "feat: category and rule endpoints, starter categories seeded on first use"
```

---

## Task 10: Transactions endpoints

**Files:**
- Create: `app/api/money/transactions/route.ts`
- Create: `app/api/money/transactions/[id]/route.ts`
- Create: `app/api/money/transactions/recategorise/route.ts`

- [ ] **Step 1: Write the collection route**

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { buildAppendKey, groupKey } from '@/lib/money/dedupe-key'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = new URL(req.url).searchParams
  const accountId = p.get('account_id')
  const from = p.get('from')
  const to = p.get('to')
  const categoryId = p.get('category_id')
  const uncategorised = p.get('uncategorised') === '1'

  // Paged: a year of statements is thousands of rows, and a truncated spending
  // total looks self-consistent.
  const PAGE = 1000
  const rows: unknown[] = []
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from('money_transactions')
      .select('*')
      .order('txn_date', { ascending: false })
      .range(offset, offset + PAGE - 1)

    if (accountId) q = q.eq('account_id', accountId)
    if (from) q = q.gte('txn_date', from)
    if (to) q = q.lte('txn_date', to)
    if (categoryId) q = q.eq('category_id', categoryId)
    if (uncategorised) q = q.is('category_id', null)

    const { data: page, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows.push(...(page ?? []))
    if (!page || page.length < PAGE) break
  }

  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.account_id) return NextResponse.json({ error: 'account_id is required.' }, { status: 400 })

  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: 'amount must be a non-zero number.' }, { status: 400 })
  }

  const description = String(body.description ?? '').trim()
  if (!description) return NextResponse.json({ error: 'A description is required.' }, { status: 400 })

  const txnDate = String(body.txn_date ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txnDate)) {
    return NextResponse.json({ error: 'txn_date must be YYYY-MM-DD.' }, { status: 400 })
  }
  // One day of tolerance: statements occasionally carry a pending entry dated
  // tomorrow. More than that is a typo.
  const limit = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  if (txnDate > limit) {
    return NextResponse.json({ error: 'That date is too far in the future.' }, { status: 400 })
  }

  const { data: account } = await supabase
    .from('money_accounts').select('id').eq('id', body.account_id).maybeSingle()
  if (!account) return NextResponse.json({ error: 'Unknown account.' }, { status: 400 })

  // A hand-typed transaction asserts it happened in addition to what is stored,
  // so it appends rather than collapsing onto an identical existing row.
  const row = { txn_date: txnDate, description, amount, external_id: body.external_id || null }
  const { data: existing } = await supabase
    .from('money_transactions')
    .select('dedupe_key, txn_date, description, amount')
    .eq('account_id', body.account_id)
    .eq('txn_date', txnDate)
  const sameGroup = new Set(
    (existing ?? [])
      .filter(r => groupKey(String(body.account_id), {
        txn_date: r.txn_date as string,
        description: r.description as string,
        amount: Number(r.amount),
        external_id: null,
      }) === groupKey(String(body.account_id), row))
      .map(r => r.dedupe_key as string),
  )

  const dedupe_key = buildAppendKey(String(body.account_id), row, sameGroup)

  const { data, error } = await supabase
    .from('money_transactions')
    .upsert({
      user_id: user.id,
      account_id: body.account_id,
      txn_date: txnDate,
      description,
      merchant: body.merchant || null,
      amount: Math.round(amount * 100) / 100,
      category_id: body.category_id || null,
      category_source: body.category_id ? 'manual' : null,
      document_id: body.document_id || null,
      external_id: body.external_id || null,
      dedupe_key,
      notes: body.notes || null,
    }, { onConflict: 'user_id,dedupe_key' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Write the item route**

`app/api/money/transactions/[id]/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}

  // Any category set here is the user's own decision, so it is marked manual and
  // becomes immune to later rule and AI passes.
  if (body.category_id !== undefined) {
    patch.category_id = body.category_id || null
    patch.category_source = body.category_id ? 'manual' : null
  }
  if (body.merchant !== undefined) patch.merchant = body.merchant || null
  if (body.notes !== undefined) patch.notes = body.notes || null

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('money_transactions').update(patch).eq('id', id).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error, count } = await supabase
    .from('money_transactions').delete({ count: 'exact' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
```

- [ ] **Step 3: Write the recategorise route**

`app/api/money/transactions/recategorise/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { applyRules } from '@/lib/money/categorise'
import type { MoneyCategoryRule, MoneyTransaction } from '@/lib/money/spending-types'

/**
 * Re-runs the rule set over stored transactions.
 *
 * Rules are deterministic, so this is safe to run repeatedly — which is the
 * point of storing rules rather than relying on a fresh AI judgement each time.
 * Manual categories are left alone by applyRules.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const onlyUncategorised = body.only_uncategorised === true

  const [{ data: rules }, { data: txns }] = await Promise.all([
    supabase.from('money_category_rules').select('*'),
    (onlyUncategorised
      ? supabase.from('money_transactions').select('*').is('category_id', null)
      : supabase.from('money_transactions').select('*')),
  ])

  const before = (txns ?? []) as MoneyTransaction[]
  const after = applyRules(before, (rules ?? []) as MoneyCategoryRule[])

  let changed = 0
  for (let i = 0; i < after.length; i++) {
    if (after[i].category_id === before[i].category_id) continue
    const { error } = await supabase
      .from('money_transactions')
      .update({ category_id: after[i].category_id, category_source: after[i].category_source })
      .eq('id', before[i].id)
    if (!error) changed++
  }

  return NextResponse.json({
    examined: before.length,
    changed,
    still_uncategorised: after.filter(t => !t.category_id).length,
  })
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/api/money/transactions
git commit -m "feat: transaction endpoints with paged listing and rule re-run"
```

---

## Task 11: Extend the ingest route to file transactions

**Files:**
- Modify: `app/api/money/ingest/route.ts`

The route currently extracts balances only. It must also extract transactions from the same upload,
so one PDF statement populates both.

- [ ] **Step 1: Add transaction handling**

After the existing balance handling and before the final `NextResponse.json`, insert:

```ts
  /* ---- Transactions ---- */
  // A statement carries both a closing balance and a transaction list, so one
  // upload should populate both rather than needing two.
  let txnResult: {
    filed: number
    skipped_duplicates: number
    low_confidence: number
    unresolved_account: boolean
    ai_categorised?: number
    proposed_rules?: CategorySuggestion[]
    warning: string | null
  } | null = null

  {
    const singleAccount = (accounts ?? []).length === 1 ? (accounts ?? [])[0] : null
    // Every transaction needs an account. With one on record it is unambiguous;
    // otherwise the balance rows tell us which account this statement is for.
    const targetAccountId = resolvedAccountId ?? singleAccount?.id ?? null

    let parsed: ParsedTransaction[] = []
    let lowConfidence: ParsedTransaction[] = []
    let warning: string | null = null

    if (isCsv) {
      const r = parseTransactionCsv(bytes.toString('utf8'))
      parsed = r.rows
      if (r.errors.length && r.rows.length === 0) warning = r.errors[0]
    } else {
      const r = await extractTransactions({
        data: bytes.toString('base64'),
        mediaType: file.type || 'image/png',
      })
      parsed = r.rows
      lowConfidence = r.lowConfidence
      warning = r.warning
    }

    if (parsed.length > 0 && !targetAccountId) {
      txnResult = {
        filed: 0, skipped_duplicates: 0, low_confidence: lowConfidence.length,
        unresolved_account: true,
        warning: 'Found transactions but could not tell which account they belong to. Say which account and re-upload.',
      }
    } else if (parsed.length > 0 && targetAccountId) {
      // A statement is authoritative for its own window, so keys are generated
      // from the batch alone. Re-importing regenerates the same keys and the
      // upsert collapses them; only genuinely new rows land as new keys.
      const keys = buildImportKeys(targetAccountId, parsed)

      const { data: existingKeys } = await supabase
        .from('money_transactions')
        .select('dedupe_key')
        .eq('account_id', targetAccountId)
      const stored = new Set((existingKeys ?? []).map(r => r.dedupe_key as string))

      const { data: rules } = await supabase.from('money_category_rules').select('*')
      const categorised = applyRules(
        parsed.map(p => ({ ...p, category_id: null, category_source: null })),
        (rules ?? []) as MoneyCategoryRule[],
      )

      // Rules first, Claude only for what they missed. On a first import that is
      // everything; once suggestions have been accepted as rules it is almost
      // nothing, and the result becomes deterministic.
      const unmatched = categorised.filter(c => !c.category_id).map(c => c.description)
      let suggestions: CategorySuggestion[] = []
      if (unmatched.length > 0) {
        const { data: cats } = await supabase.from('money_categories').select('*')
        try {
          suggestions = await suggestCategories(unmatched, (cats ?? []) as MoneyCategory[])
        } catch {
          // A suggestion failure must not lose the transactions themselves; they
          // simply stay uncategorised and visible.
          suggestions = []
        }
        const byDescription = new Map(suggestions.map(x => [x.description.toLowerCase(), x]))
        for (const c of categorised) {
          if (c.category_id) continue
          const hit = byDescription.get(c.description.trim().toLowerCase())
          if (!hit) continue
          c.category_id = hit.category_id
          c.category_source = 'ai'
        }
      }

      const payload = parsed.map((p, i) => ({
        user_id: user.id,
        account_id: targetAccountId,
        txn_date: p.txn_date,
        description: p.description,
        amount: p.amount,
        category_id: categorised[i].category_id,
        category_source: categorised[i].category_source,
        document_id: doc.id,
        external_id: p.external_id,
        dedupe_key: keys[i],
      }))

      const alreadyThere = keys.filter(k => stored.has(k)).length

      const { data: inserted, error: txnErr } = await supabase
        .from('money_transactions')
        .upsert(payload, { onConflict: 'user_id,dedupe_key' })
        .select('id')

      // Distinct proposals only, so the UI can offer "make this a rule" once per
      // merchant rather than once per transaction.
      const proposedRules = [...new Map(
        suggestions.map(x => [`${x.suggested_pattern.toLowerCase()}|${x.category_id}`, x]),
      ).values()]

      txnResult = {
        filed: txnErr ? 0 : (inserted ?? []).length - alreadyThere,
        skipped_duplicates: alreadyThere,
        low_confidence: lowConfidence.length,
        unresolved_account: false,
        ai_categorised: suggestions.length,
        proposed_rules: proposedRules,
        warning: txnErr ? txnErr.message : warning,
      }
    } else {
      txnResult = {
        filed: 0, skipped_duplicates: 0, low_confidence: lowConfidence.length,
        unresolved_account: false, warning,
      }
    }
  }
```

Add `transactions: txnResult` to the response object.

Add these imports at the top:

```ts
import { extractTransactions } from '@/lib/money/extract-transactions'
import { parseTransactionCsv } from '@/lib/money/parse-transaction-csv'
import { buildImportKeys } from '@/lib/money/dedupe-key'
import { applyRules } from '@/lib/money/categorise'
import { suggestCategories, type CategorySuggestion } from '@/lib/money/suggest-categories'
import type { MoneyCategory, MoneyCategoryRule, ParsedTransaction } from '@/lib/money/spending-types'
```

> `buildImportKeys` here, not `buildAppendKey`: a statement is authoritative for its own window, so
> re-importing must regenerate the same keys and collapse. `buildAppendKey` is only for the manual
> single-transaction POST in Task 10, where an identical row means "this happened as well".

In the existing balance section, after `const resolved = extracted.map(...)`, add:

```ts
  // Which account is this statement for? If the balances all resolved to one
  // account, that is the answer. If they disagree, or none matched, the
  // transactions cannot be filed safely and are reported back instead.
  const resolvedIds = [...new Set(resolved.map(r => r.account_id).filter(Boolean))]
  const resolvedAccountId = resolvedIds.length === 1 ? (resolvedIds[0] as string) : null
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/api/money/ingest/route.ts
git commit -m "feat: file transactions from the same statement upload as balances"
```

---

## Task 12: Spending tab

**Files:**
- Create: `components/money/SpendingByCategory.tsx`
- Create: `components/money/CategoryTrend.tsx`
- Create: `app/(dashboard)/dashboard/money/spending/page.tsx`

- [ ] **Step 1: Write the category breakdown**

```tsx
'use client'
import type { CategoryTotal } from '@/lib/money/spending-summary'

const money = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 })

const COLOURS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

/** Uncategorised is drawn in grey and never hidden — it distorts every other share. */
export default function SpendingByCategory({ rows }: { rows: CategoryTotal[] }) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 12, color: '#9ca3af' }}>Nothing spent in this month.</p>
  }

  return (
    <div>
      {rows.map((r, i) => (
        <div key={r.categoryId ?? 'uncategorised'} style={{ marginBottom: 9 }}>
          <div style={{ display: 'flex', fontSize: 12, marginBottom: 3 }}>
            <span style={{ flex: 1, fontWeight: r.categoryId ? 500 : 700, color: r.categoryId ? '#111' : '#6b7280' }}>
              {r.name}
            </span>
            <span style={{ fontWeight: 600 }}>{money(r.total)}</span>
            <span style={{ width: 52, textAlign: 'right', color: '#9ca3af' }}>
              {Math.round(r.share * 100)}%
            </span>
          </div>
          <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.max(r.share * 100, 1)}%`,
              background: r.categoryId ? COLOURS[i % COLOURS.length] : '#9ca3af',
              borderRadius: 3,
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Write the trend chart**

```tsx
'use client'

export interface TrendPoint { month: string; total: number }

const money = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })

/** Spending per month. Bars rather than a line: months are discrete buckets. */
export default function CategoryTrend({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) {
    return <p style={{ fontSize: 12, color: '#9ca3af' }}>Not enough history yet.</p>
  }

  const W = 720, H = 180, PAD = 34
  const max = Math.max(...points.map(p => p.total), 1)
  const bw = (W - PAD * 2) / points.length

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {points.map((p, i) => {
        const h = (p.total / max) * (H - PAD * 2)
        return (
          <g key={p.month}>
            <rect
              x={PAD + i * bw + bw * 0.15}
              y={H - PAD - h}
              width={bw * 0.7}
              height={Math.max(h, 1)}
              fill="#3b82f6"
              rx="2"
            >
              <title>{`${p.month}: ${money(p.total)}`}</title>
            </rect>
            <text
              x={PAD + i * bw + bw / 2}
              y={H - PAD + 12}
              fontSize="9"
              fill="#9ca3af"
              textAnchor="middle"
            >
              {p.month.slice(5)}
            </text>
          </g>
        )
      })}
      <text x={PAD} y={14} fontSize="10" fill="#9ca3af">{money(max)}</text>
      <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="#e5e7eb" />
    </svg>
  )
}
```

- [ ] **Step 3: Write the Spending page**

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import SpendingByCategory from '@/components/money/SpendingByCategory'
import CategoryTrend, { type TrendPoint } from '@/components/money/CategoryTrend'
import { buildSpendingSummary } from '@/lib/money/spending-summary'
import type { MoneyCategory, MoneyTransaction } from '@/lib/money/spending-types'
import type { MoneyAccount } from '@/lib/money/types'

const money = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 })

const thisMonth = () => new Date().toISOString().slice(0, 7)

export default function SpendingPage() {
  const [txns, setTxns] = useState<MoneyTransaction[]>([])
  const [cats, setCats] = useState<MoneyCategory[]>([])
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [month, setMonth] = useState(thisMonth())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/money/transactions').then(r => r.json()),
      fetch('/api/money/categories').then(r => r.json()),
      fetch('/api/money/accounts').then(r => r.json()),
    ]).then(([t, c, a]) => {
      setTxns(Array.isArray(t) ? t : [])
      setCats(Array.isArray(c) ? c : [])
      setAccounts(Array.isArray(a) ? a : [])
      setLoading(false)
    })
  }, [])

  const months = useMemo(
    () => [...new Set(txns.map(t => t.txn_date.slice(0, 7)))].sort().reverse(),
    [txns],
  )

  const summary = useMemo(
    () => buildSpendingSummary(txns, cats, accounts, month),
    [txns, cats, accounts, month],
  )

  const trend: TrendPoint[] = useMemo(
    () => [...months].reverse().slice(-12).map(m => ({
      month: m,
      total: buildSpendingSummary(txns, cats, accounts, m).totalOut,
    })),
    [months, txns, cats, accounts],
  )

  if (loading) return <div style={{ padding: 40, fontSize: 12, color: '#9ca3af' }}>Loading…</div>

  if (txns.length === 0) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🧾</div>
      <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>No transactions yet</p>
      <p style={{ fontSize: 12, color: '#6b7280' }}>
        Drop a bank statement PDF or CSV into JARVIS and I&apos;ll file it.
      </p>
    </div>
  )

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', marginBottom: 16,
  }

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <select value={month} onChange={e => setMonth(e.target.value)}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
          {(months.includes(month) ? months : [month, ...months]).map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>
          {summary.transactionCount} transaction{summary.transactionCount === 1 ? '' : 's'}
        </span>
      </div>

      {summary.currencyWarning && (
        <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a' }}>
          <p style={{ fontSize: 12, color: '#92400e' }}>{summary.currencyWarning}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontSize: 21, fontWeight: 800, color: '#dc2626' }}>{money(summary.totalOut)}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Out</div>
        </div>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontSize: 21, fontWeight: 800, color: '#059669' }}>{money(summary.totalIn)}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>In</div>
        </div>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontSize: 21, fontWeight: 800 }}>{money(summary.net)}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Net</div>
        </div>
      </div>

      {summary.uncategorisedCount > 0 && (
        <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a' }}>
          <p style={{ fontSize: 12, color: '#92400e' }}>
            <strong>{summary.uncategorisedCount}</strong> transaction
            {summary.uncategorisedCount === 1 ? '' : 's'} worth{' '}
            <strong>{money(summary.uncategorisedValue)}</strong> aren&apos;t categorised yet, so the
            breakdown below is incomplete. Categorise them in the Transactions tab.
          </p>
        </div>
      )}

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Where it went</h3>
        <SpendingByCategory rows={summary.byCategory} />
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Spending by month</h3>
        <CategoryTrend points={trend} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add components/money/SpendingByCategory.tsx components/money/CategoryTrend.tsx "app/(dashboard)/dashboard/money/spending/page.tsx"
git commit -m "feat: spending tab with category breakdown and monthly trend

The uncategorised count and value are stated above the breakdown, because an
incomplete breakdown otherwise reads as a complete one."
```

---

## Task 12a: Show reconciliation on the Accounts tab

`reconcile.ts` is built and tested in Task 6, but nothing displays it — so a missed statement page
would still go unnoticed, which was the entire reason for writing it.

**Files:**
- Modify: `app/(dashboard)/dashboard/money/accounts/page.tsx`

- [ ] **Step 1: Load balances and transactions alongside accounts**

Add the imports:

```ts
import { reconcileAccount } from '@/lib/money/reconcile'
import type { MoneyTransaction } from '@/lib/money/spending-types'
import type { MoneyBalance } from '@/lib/money/types'
```

Add the state, beside the existing `accounts` state:

```ts
  const [balances, setBalances] = useState<MoneyBalance[]>([])
  const [txns, setTxns] = useState<MoneyTransaction[]>([])
```

Replace the `load` function with:

```ts
  const load = () => Promise.all([
    fetch('/api/money/accounts').then(r => r.json()),
    fetch('/api/money/balances').then(r => r.json()),
    fetch('/api/money/transactions').then(r => r.json()),
  ]).then(([a, b, t]) => {
    setAccounts(Array.isArray(a) ? a : [])
    setBalances(Array.isArray(b) ? b : [])
    setTxns(Array.isArray(t) ? t : [])
    setLoading(false)
  })
```

- [ ] **Step 2: Render a warning line per mismatched interval**

Inside the account row, immediately after the `balanceFor === a.id` block, add:

```tsx
                  {(() => {
                    const gbp = (n: number) =>
                      n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
                    const bad = reconcileAccount(
                      balances.filter(b => b.account_id === a.id),
                      txns.filter(t => t.account_id === a.id),
                    ).filter(i => !i.ok)
                    if (bad.length === 0) return null
                    return (
                      <div style={{
                        marginTop: 6, padding: '6px 8px', background: '#fffbeb',
                        border: '1px solid #fde68a', borderRadius: 6,
                        fontSize: 10, color: '#92400e', lineHeight: 1.6,
                      }}>
                        {bad.map(i => (
                          <div key={`${i.from}-${i.to}`}>
                            {i.from} to {i.to}: the balance moved {gbp(i.balanceChange)} but recorded
                            transactions total {gbp(i.transactionSum)} —{' '}
                            {gbp(Math.abs(i.discrepancy))}{' '}
                            {i.discrepancy < 0
                              ? 'of transactions appear to be missing.'
                              : 'more than the balance change accounts for.'}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
```

Only mismatches are shown. A clean interval needs no commentary, and a line per healthy interval
would bury the one that matters.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/dashboard/money/accounts/page.tsx"
git commit -m "feat: surface reconciliation gaps on the accounts tab

Warns where recorded transactions do not explain a balance change, which is how
a missed statement page becomes visible instead of just making the spending
figures quietly low."
```

---

## Task 13: Transactions tab

**Files:**
- Create: `app/(dashboard)/dashboard/money/transactions/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MoneyCategory, MoneyTransaction } from '@/lib/money/spending-types'
import type { MoneyAccount } from '@/lib/money/types'

const money = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 })

export default function TransactionsPage() {
  const [txns, setTxns] = useState<MoneyTransaction[]>([])
  const [cats, setCats] = useState<MoneyCategory[]>([])
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [search, setSearch] = useState('')
  const [onlyUncategorised, setOnlyUncategorised] = useState(false)
  const [accountFilter, setAccountFilter] = useState('')

  const load = useCallback(() => Promise.all([
    fetch('/api/money/transactions').then(r => r.json()),
    fetch('/api/money/categories').then(r => r.json()),
    fetch('/api/money/accounts').then(r => r.json()),
  ]).then(([t, c, a]) => {
    setTxns(Array.isArray(t) ? t : [])
    setCats(Array.isArray(c) ? c : [])
    setAccounts(Array.isArray(a) ? a : [])
    setLoading(false)
  }), [])

  useEffect(() => { void load() }, [load])

  async function setCategory(t: MoneyTransaction, categoryId: string) {
    setError('')
    const res = await fetch(`/api/money/transactions/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: categoryId || null }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not update.')
    setTxns(prev => prev.map(x => (x.id === t.id ? d : x)))
  }

  /** Turns one correction into a rule, so the same merchant is right next time. */
  async function createRule(t: MoneyTransaction) {
    if (!t.category_id) return setError('Give it a category first, then create the rule.')
    const pattern = prompt(
      'Create a rule: any transaction whose description contains this text gets that category.',
      t.description.split(/\s{2,}|,/)[0].trim().slice(0, 40),
    )
    if (!pattern) return

    const res = await fetch('/api/money/rules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern, match_type: 'contains', category_id: t.category_id }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not create the rule.')

    const re = await fetch('/api/money/transactions/recategorise', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ only_uncategorised: true }),
    })
    const rd = await re.json()
    setNotice(`Rule saved. ${rd.changed ?? 0} transaction(s) recategorised, ${rd.still_uncategorised ?? 0} still uncategorised.`)
    await load()
  }

  const filtered = useMemo(() => txns.filter(t => {
    if (onlyUncategorised && t.category_id) return false
    if (accountFilter && t.account_id !== accountFilter) return false
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [txns, onlyUncategorised, accountFilter, search])

  if (loading) return <div style={{ padding: 40, fontSize: 12, color: '#9ca3af' }}>Loading…</div>
  if (txns.length === 0) return (
    <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: '#6b7280' }}>
      No transactions yet. Drop a statement into JARVIS.
    </div>
  )

  const input: React.CSSProperties = {
    border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', fontSize: 12,
  }
  const cell: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid #f9fafb', fontSize: 12 }
  const nameOf = (id: string) => accounts.find(a => a.id === id)?.name ?? '—'

  return (
    <div style={{ padding: '20px 22px' }}>
      {error && <p style={{ fontSize: 12, color: '#991b1b', marginBottom: 8 }}>{error}</p>}
      {notice && <p style={{ fontSize: 12, color: '#065f46', marginBottom: 8 }}>{notice}</p>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={input} placeholder="Search description…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={input} value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label style={{ fontSize: 11, color: '#6b7280', display: 'flex', gap: 5, alignItems: 'center' }}>
          <input type="checkbox" checked={onlyUncategorised} onChange={e => setOnlyUncategorised(e.target.checked)} />
          uncategorised only
        </label>
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
          {filtered.length} of {txns.length}
        </span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Date', 'Description', 'Account', 'Amount', 'Category', ''].map(h => (
                <th key={h} style={{
                  textAlign: h === 'Amount' ? 'right' : 'left', padding: '8px 12px',
                  background: '#fafafa', color: '#9ca3af', fontWeight: 600, fontSize: 11,
                  borderBottom: '1px solid #f3f4f6',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map(t => (
              <tr key={t.id}>
                <td style={cell}>{t.txn_date}</td>
                <td style={{ ...cell, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.description}
                </td>
                <td style={{ ...cell, color: '#9ca3af' }}>{nameOf(t.account_id)}</td>
                <td style={{ ...cell, textAlign: 'right', fontWeight: 600, color: Number(t.amount) < 0 ? '#111' : '#059669' }}>
                  {money(Number(t.amount))}
                </td>
                <td style={cell}>
                  <select
                    value={t.category_id ?? ''}
                    onChange={e => setCategory(t, e.target.value)}
                    style={{
                      ...input, padding: '3px 6px', fontSize: 11,
                      borderColor: t.category_id ? '#d1d5db' : '#fbbf24',
                    }}
                  >
                    <option value="">— uncategorised —</option>
                    {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {t.category_source && (
                    <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 4 }}>{t.category_source}</span>
                  )}
                </td>
                <td style={cell}>
                  <button onClick={() => createRule(t)} title="Apply this category to similar descriptions"
                    style={{ ...input, padding: '3px 7px', fontSize: 10, cursor: 'pointer', background: '#fff' }}>
                    Rule
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 500 && (
        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>
          Showing the first 500 of {filtered.length}. Narrow the filters to see the rest — nothing has
          been deleted.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/money/transactions/page.tsx"
git commit -m "feat: transactions tab with inline categorising and rule creation"
```

---

## Task 14: Add the two tabs to the shell

**Files:**
- Modify: `components/money/MoneyShell.tsx`

- [ ] **Step 1: Extend the TABS array**

```tsx
const TABS = [
  { label: 'Overview', icon: '📊', href: '/dashboard/money/overview' },
  { label: 'Spending', icon: '🧾', href: '/dashboard/money/spending' },
  { label: 'Transactions', icon: '📃', href: '/dashboard/money/transactions' },
  { label: 'Accounts', icon: '🏦', href: '/dashboard/money/accounts' },
  { label: 'History', icon: '🕘', href: '/dashboard/money/history' },
]
```

- [ ] **Step 2: Report transaction results after an upload**

In `upload`, after the existing `bits.push(...)` lines for balances, add:

```tsx
      const tx = data.transactions
      if (tx) {
        if (tx.filed) bits.push(`Filed ${tx.filed} transaction${tx.filed === 1 ? '' : 's'}.`)
        if (tx.skipped_duplicates) bits.push(`${tx.skipped_duplicates} already on record, skipped.`)
        if (tx.ai_categorised) bits.push(`${tx.ai_categorised} categorised by me — check them in Transactions.`)
        if (tx.low_confidence) bits.push(`${tx.low_confidence} transaction line(s) were unclear and not filed.`)
        if (tx.unresolved_account) bits.push('I could not tell which account those transactions belong to.')
        if (tx.warning) bits.push(tx.warning)
        // Offering the rules is what turns a one-off AI guess into a permanent,
        // deterministic decision the user controls.
        if (tx.proposed_rules?.length) {
          bits.push(`I can turn ${tx.proposed_rules.length} of those into reusable rules — say "make the rules" and I will.`)
        }
      }
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint app components lib`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/money/MoneyShell.tsx
git commit -m "feat: spending and transactions tabs, and report ingest results"
```

---

## Task 15: JARVIS spending tools

**Files:**
- Modify: `lib/money/jarvis-tools.ts`

- [ ] **Step 1: Add the tool schemas**

Append to `MONEY_TOOLS`:

```ts
  {
    name: 'get_spending_summary',
    description:
      'Spending for a month: total out, total in, net, and a category breakdown. Transfers between ' +
      'the user\'s own accounts are excluded from both totals. Always states how many transactions ' +
      'are uncategorised, since the breakdown is incomplete without them.',
    input_schema: {
      type: 'object' as const,
      properties: { month: { type: 'string', description: 'YYYY-MM. Defaults to the current month.' } },
      required: [],
    },
  },
  {
    name: 'get_transactions',
    description: 'Transactions, filtered. Use for "what did I spend at X" or "show me last week".',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Match against the description.' },
        from: { type: 'string', description: 'YYYY-MM-DD inclusive.' },
        to: { type: 'string', description: 'YYYY-MM-DD inclusive.' },
        uncategorised_only: { type: 'boolean' },
        limit: { type: 'number', description: 'Default 50, max 200.' },
      },
      required: [],
    },
  },
  {
    name: 'add_category_rule',
    description:
      'Create a rule so descriptions containing a phrase get a category, then re-run it over ' +
      'uncategorised transactions. Use when the user says what something should be categorised as.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: { type: 'string', description: 'Text to look for in the description.' },
        category_name: { type: 'string', description: 'Category to assign. Must already exist.' },
      },
      required: ['pattern', 'category_name'],
    },
  },
```

- [ ] **Step 2: Add the handlers**

Insert into `executeMoneyTool` before the final `return`:

```ts
  if (name === 'get_spending_summary') {
    const month = String(input.month ?? new Date().toISOString().slice(0, 7))
    const [{ data: txns }, { data: cats }, { data: accts }] = await Promise.all([
      supabase.from('money_transactions').select('*'),
      supabase.from('money_categories').select('*'),
      supabase.from('money_accounts').select('*'),
    ])
    const summary = buildSpendingSummary(
      (txns ?? []) as MoneyTransaction[],
      (cats ?? []) as MoneyCategory[],
      (accts ?? []) as MoneyAccount[],
      month,
    )
    if (summary.currencyWarning) return summary.currencyWarning
    if (summary.transactionCount === 0) return `No transactions recorded for ${month}.`
    return json({
      month: summary.month,
      total_out: summary.totalOut,
      total_in: summary.totalIn,
      net: summary.net,
      by_category: summary.byCategory.map(c => ({
        category: c.name, total: c.total, share_percent: Math.round(c.share * 100),
      })),
      // Always reported, so an incomplete breakdown cannot be presented as complete.
      uncategorised_count: summary.uncategorisedCount,
      uncategorised_value: summary.uncategorisedValue,
      transactions: summary.transactionCount,
      note: 'Transfers between own accounts are excluded from both totals.',
    })
  }

  if (name === 'get_transactions') {
    const limit = Math.min(Number(input.limit) || 50, 200)
    let q = supabase.from('money_transactions').select('*').order('txn_date', { ascending: false })
    if (input.from) q = q.gte('txn_date', String(input.from).slice(0, 10))
    if (input.to) q = q.lte('txn_date', String(input.to).slice(0, 10))
    if (input.uncategorised_only === true) q = q.is('category_id', null)

    const { data } = await q
    let rows = (data ?? []) as MoneyTransaction[]
    const search = String(input.search ?? '').toLowerCase()
    if (search) rows = rows.filter(t => t.description.toLowerCase().includes(search))
    if (rows.length === 0) return 'No transactions matched.'

    const { data: cats } = await supabase.from('money_categories').select('id, name')
    const catName = new Map((cats ?? []).map(c => [c.id as string, c.name as string]))

    return json({
      matched: rows.length,
      showing: Math.min(rows.length, limit),
      total: Math.round(rows.reduce((a, t) => a + Number(t.amount), 0) * 100) / 100,
      transactions: rows.slice(0, limit).map(t => ({
        date: t.txn_date, description: t.description, amount: Number(t.amount),
        category: t.category_id ? catName.get(t.category_id) ?? 'Unknown' : 'Uncategorised',
      })),
    })
  }

  if (name === 'add_category_rule') {
    const pattern = String(input.pattern ?? '').trim()
    const wanted = String(input.category_name ?? '').trim().toLowerCase()
    if (!pattern) return 'A pattern is required.'

    const { data: cats } = await supabase.from('money_categories').select('id, name')
    const matches = (cats ?? []).filter(c => (c.name as string).toLowerCase().includes(wanted))
    if (matches.length === 0) {
      return `No category matched "${input.category_name}". On record: ${(cats ?? []).map(c => c.name).join(', ')}`
    }
    if (matches.length > 1) {
      return `"${input.category_name}" matches ${matches.map(c => c.name).join(', ')}. Ask which one.`
    }

    const { error } = await supabase.from('money_category_rules').insert({
      user_id: userId, pattern, match_type: 'contains', category_id: matches[0].id, priority: 100,
    })
    if (error) return `Could not save the rule: ${error.message}`

    // Apply it immediately; rules are deterministic so this is safe to repeat.
    const [{ data: rules }, { data: txns }] = await Promise.all([
      supabase.from('money_category_rules').select('*'),
      supabase.from('money_transactions').select('*').is('category_id', null),
    ])
    const before = (txns ?? []) as MoneyTransaction[]
    const after = applyRules(before, (rules ?? []) as MoneyCategoryRule[])
    let changed = 0
    for (let i = 0; i < after.length; i++) {
      if (after[i].category_id === before[i].category_id) continue
      const { error: upErr } = await supabase
        .from('money_transactions')
        .update({ category_id: after[i].category_id, category_source: after[i].category_source })
        .eq('id', before[i].id)
      if (!upErr) changed++
    }

    return `Rule saved: descriptions containing "${pattern}" are now ${matches[0].name}. ${changed} transaction(s) recategorised.`
  }
```

Add the imports at the top of the file:

```ts
import { buildSpendingSummary } from './spending-summary'
import { applyRules } from './categorise'
import type { MoneyCategory, MoneyCategoryRule, MoneyTransaction } from './spending-types'
```

- [ ] **Step 3: Extend the JARVIS system prompt**

In `app/api/jarvis/route.ts`, the Money paragraph already exists. Append to it:

```
You can also see his transactions and monthly spending by category, and create a categorisation rule when he tells you what something should be. Transfers between his own accounts are excluded from spending and income totals. Whenever you give a spending figure, say how many transactions are uncategorised — a breakdown that omits them is incomplete and must not be presented as final.
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add lib/money/jarvis-tools.ts app/api/jarvis/route.ts
git commit -m "feat: JARVIS spending summary, transaction search and rule creation"
```

---

## Task 16: Full test run, build and deploy

- [ ] **Step 1: Run the suite**

Run: `npx jest`
Expected: all money tests pass. `Navbar.test.tsx` may still fail — pre-existing and unrelated.

- [ ] **Step 2: Build**

Run: `NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ.dummy.sig" npx next build`
Expected: succeeds, and `/dashboard/money/spending` and `/dashboard/money/transactions` appear in
the route list.

- [ ] **Step 3: Push**

```bash
gh auth switch --user mmsrashid
git push origin main
gh auth switch --user mmsrashid-profinity
```

---

## Task 17: Verify against the deployed site

Local dev cannot reach the database, so verification happens live in the browser.

- [ ] **Step 1: Seed a throwaway account and confirm categories seed**

```js
const j = (u,m,b) => fetch(u,{method:m||'GET',headers:b?{'Content-Type':'application/json'}:undefined,body:b?JSON.stringify(b):undefined}).then(async r=>({s:r.status,d:await r.json().catch(()=>({}))}));
const acct = await j('/api/money/accounts','POST',{name:'ZZTEST Current',kind:'current'});
window.__a = acct.d.id;
const cats = await j('/api/money/categories');
console.log('categories seeded:', cats.d.length, cats.d.slice(0,3).map(c=>c.name));
```

Expected: 21 categories on first call.

- [ ] **Step 2: Verify the dedupe behaviour that matters most**

```js
const mk = (date, desc, amt) => j('/api/money/transactions','POST',{account_id:window.__a,txn_date:date,description:desc,amount:amt});
await mk('2026-02-04','PRET A MANGER',-3.20);
await mk('2026-02-04','PRET A MANGER',-3.20);   // second real coffee
const all = await j('/api/money/transactions');
const prets = all.d.filter(t=>t.description.includes('PRET'));
console.log('two identical same-day transactions kept:', prets.length, '(expect 2)');
await mk('2026-02-04','PRET A MANGER',-3.20);   // a third: also legitimate
const after = await j('/api/money/transactions');
console.log('after a third:', after.d.filter(t=>t.description.includes('PRET')).length, '(expect 3)');
```

Expected: 2, then 3. Each POST of a genuinely repeated purchase adds a row; this is the correct
behaviour, and the idempotency that matters is tested at the ingest layer in Step 4.

- [ ] **Step 3: Verify manual categorisation is not overwritten**

```js
const cats = (await j('/api/money/categories')).d;
const groceries = cats.find(c=>c.name==='Groceries').id;
const eatingOut = cats.find(c=>c.name==='Eating out').id;
const txns = (await j('/api/money/transactions')).d;
const one = txns[0];
await j(`/api/money/transactions/${one.id}`,'PATCH',{category_id:eatingOut});
await j('/api/money/rules','POST',{pattern:'PRET',match_type:'contains',category_id:groceries});
const re = await j('/api/money/transactions/recategorise','POST',{});
const again = (await j('/api/money/transactions')).d.find(t=>t.id===one.id);
console.log('manual survived recategorise:', again.category_id===eatingOut, again.category_source, '(expect true, manual)');
console.log('recategorise result:', re.d);
```

- [ ] **Step 4: Verify a CSV import is idempotent**

Build a small CSV in the browser and upload it twice through the ingest route:

```js
const csv = ['Date,Description,Amount','2026-03-01,RENT,-1200','2026-03-02,TESCO,-42.10','2026-03-02,TESCO,-42.10'].join('\n');
const send = async () => {
  const fd = new FormData();
  fd.append('file', new File([csv], 'statement.csv', {type:'text/csv'}));
  const r = await fetch('/api/money/ingest',{method:'POST',body:fd});
  return {s:r.status, d:await r.json()};
};
const first = await send();
const second = await send();
console.log('first :', first.d.transactions);
console.log('second:', second.d.transactions);
const march = (await j('/api/money/transactions')).d.filter(t=>t.txn_date.startsWith('2026-03'));
console.log('march rows:', march.length, '(expect 3 — the two identical TESCO rows both kept, nothing doubled)');
```

Expected: the first import files 3; the second files 0 and reports 3 skipped duplicates; March holds
exactly 3 rows.

- [ ] **Step 5: Verify the spending summary and JARVIS**

```js
const s = await j('/api/money/transactions');
console.log('total rows:', s.d.length);
```

Then in the Spending tab, confirm the month selector, the totals, the uncategorised banner and the
breakdown render. Then ask JARVIS, in the Money tab: "What did I spend in March 2026?" — expect a
`get_spending_summary` call and an answer that states the uncategorised count.

- [ ] **Step 6: Clean up**

```js
const accts = (await j('/api/money/accounts')).d.filter(a=>a.name.startsWith('ZZTEST'));
for (const a of accts) await fetch(`/api/money/accounts/${a.id}`,{method:'DELETE'});
const rules = (await j('/api/money/rules')).d;
for (const r of rules) await fetch(`/api/money/rules/${r.id}`,{method:'DELETE'});
console.log('accounts left:', (await j('/api/money/accounts')).d.length);
console.log('transactions left:', (await j('/api/money/transactions')).d.length, '(should be 0 — cascade)');
console.log('rules left:', (await j('/api/money/rules')).d.length);
```

Leave the seeded categories in place — they are the user's starter set, not test data.

- [ ] **Step 7: Commit any fixes found during verification**

---

## Plan coverage note

Two spec promises were missing from the first draft of this plan and were added on review:
**Task 8a** (Claude suggesting categories for rows no rule matched, each returned as a proposed rule)
and **Task 12a** (displaying the reconciliation that Task 6 computes). Without them the spec's
chosen categorisation behaviour and its reconciliation warning would have been built but unreachable.

## Deferred

Do **not** build these now: budgets and monthly limits, bills & subscriptions (sub-project 3),
investments (sub-project 4), Open Banking sync, multi-currency FX conversion, merchant
normalisation beyond what the description parser already does.

Sub-project 2 is complete when the success criteria in the spec are met.
