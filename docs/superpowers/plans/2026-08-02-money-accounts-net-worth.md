# Money: Accounts & Net Worth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record what the user owns and owes across accounts, and chart net worth over time.

**Architecture:** Two core tables — `money_accounts` (definitions) and `money_balances` (dated snapshots) — plus `money_documents` for ingested files. Net worth is derived by a pure function that carries each account's last known balance forward and excludes accounts before their first snapshot. The UI mirrors the existing Health module: a tabbed shell with a JARVIS sidebar.

**Tech Stack:** Next.js 16.2.9 (App Router), Supabase (Postgres + Auth + Storage), Anthropic SDK (`claude-haiku-4-5-20251001`), Jest + Testing Library, hand-rolled SVG charts (no chart library).

**Spec:** `docs/superpowers/specs/2026-08-02-money-accounts-net-worth-design.md`

---

## Before you start — things about this codebase you cannot guess

1. **This is not the Next.js in your training data.** Read `node_modules/next/dist/docs/` before writing routing code. Notably: `middleware` is renamed `proxy`, and dynamic route `params` is a **Promise** — `const { id } = await ctx.params`.
2. **There is no `test` script.** Run `npx jest` directly. `npx jest path/to/file.test.ts` for one file.
3. **One test is already failing** — `__tests__/components/Navbar.test.tsx` › "renders nav links", a stale assertion about a nav link that no longer exists. It is unrelated to this work. Do not fix it, do not let it block you; expect `1 failed, N passed`.
4. **Local dev cannot reach the database.** `.env.local` has only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `ANTHROPIC_API_KEY` — no service-role key. Verify database work against the **deployed** site, not `npm run dev`.
5. **Migrations are applied by hand** through the Supabase SQL editor. There is no `supabase db push` in this setup. Only the Chrome profile named **"Personal Chrome"** is signed into the account owning project `bqljckwsibjlxhikilua`; use `switch_browser` and pick it.
6. **PostgREST caps rows at 1000 by default.** Any list endpoint that can grow must page explicitly with `.range()`. A truncated series looks self-consistent and is therefore worse than an error.
7. **Push protocol:** `gh auth switch --user mmsrashid` before pushing, then `gh auth switch --user mmsrashid-profinity` afterwards.
8. **Money is `numeric`, never float**, in the database and never `parseFloat`-then-round in a way that loses pennies.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/012_money.sql` | Schema: three tables, RLS, indexes |
| `lib/money/types.ts` | Enumerations, interfaces, `isLiability` — the single source of asset/liability truth |
| `lib/money/net-worth.ts` | Pure net-worth derivation. No I/O. |
| `lib/money/match-account.ts` | Fuzzy account-name matching for ingest |
| `lib/money/parse-csv.ts` | CSV → balance rows |
| `lib/money/extract.ts` | Claude tool-schema extraction from image/PDF |
| `lib/money/jarvis-tools.ts` | `MONEY_TOOLS` + executor |
| `app/api/money/accounts/route.ts` | GET list, POST create |
| `app/api/money/accounts/[id]/route.ts` | PATCH (derives `closed_date`), DELETE |
| `app/api/money/balances/route.ts` | GET (paged), POST upsert |
| `app/api/money/balances/[id]/route.ts` | PATCH, DELETE |
| `app/api/money/ingest/route.ts` | File → extracted balances |
| `app/(dashboard)/dashboard/money/layout.tsx` | Wraps children in `MoneyShell` |
| `app/(dashboard)/dashboard/money/page.tsx` | Redirect to `/overview` |
| `app/(dashboard)/dashboard/money/overview/page.tsx` | Headline + chart + account groups |
| `app/(dashboard)/dashboard/money/accounts/page.tsx` | Manage accounts, add balances |
| `app/(dashboard)/dashboard/money/history/page.tsx` | All snapshots, editable |
| `components/money/MoneyShell.tsx` | Tab bar + JARVIS sidebar + upload |
| `components/money/NetWorthTrend.tsx` | SVG chart |
| `components/money/PendingReview.tsx` | Confirm low-confidence extractions |
| `__tests__/lib/money/net-worth.test.ts` | The important tests |
| `__tests__/lib/money/match-account.test.ts` | Near-miss names |
| `__tests__/lib/money/parse-csv.test.ts` | Date boundary |

Modified: `lib/jarvis-tools.ts` (merge `MONEY_TOOLS`), `app/(dashboard)/layout.tsx` (nav link).

---

## Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/012_money.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply it**

Use `switch_browser` and select **"Personal Chrome"**. Open
`https://supabase.com/dashboard/project/bqljckwsibjlxhikilua/sql/new`.

The editor is unreliable — `window.monaco` is undefined until you click into the editor body, and `/sql/new` sometimes hangs on a spinner. Click into the page first, then set the SQL:

```js
window.monaco.editor.getModels()[0].setValue(sql)
```

Then click **Run**. Supabase shows a "Potential issue detected" dialog for anything containing `drop policy`; click **Run query**.

Expected: `Success. No rows returned`.

- [ ] **Step 3: Create the storage bucket**

In the dashboard, Storage → New bucket → name `money-documents`, **Public: off**. It must be private; files are served through short-lived signed URLs only.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/012_money.sql
git commit -m "feat: money schema — accounts, balances, documents"
```

---

## Task 2: Types

**Files:**
- Create: `lib/money/types.ts`

- [ ] **Step 1: Write the types**

```ts
export const ACCOUNT_KINDS = [
  'current', 'savings', 'isa', 'pension', 'investment',
  'credit_card', 'mortgage', 'loan', 'property', 'other',
] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

/**
 * The single source of truth for whether a balance counts against you.
 *
 * Derived from `kind` rather than stored on the row, so a bad write cannot make
 * a mortgage count as an asset.
 */
export const LIABILITY_KINDS: ReadonlySet<string> = new Set<AccountKind>([
  'credit_card', 'mortgage', 'loan',
])

export const isLiability = (kind: string) => LIABILITY_KINDS.has(kind)

export const ACCOUNT_STATUSES = ['active', 'closed'] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

export const BALANCE_SOURCES = ['manual', 'import', 'document', 'api'] as const
export type BalanceSource = (typeof BALANCE_SOURCES)[number]

export const MONEY_DOCUMENT_KINDS = ['statement', 'screenshot', 'csv', 'other'] as const
export type MoneyDocumentKind = (typeof MONEY_DOCUMENT_KINDS)[number]

/** Human labels for `kind`, for UI grouping and select options. */
export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  current: 'Current account',
  savings: 'Savings',
  isa: 'ISA',
  pension: 'Pension',
  investment: 'Investment',
  credit_card: 'Credit card',
  mortgage: 'Mortgage',
  loan: 'Loan',
  property: 'Property',
  other: 'Other',
}

export interface MoneyAccount {
  id: string
  user_id: string
  name: string
  institution: string | null
  kind: AccountKind
  currency: string
  opened_date: string | null
  closed_date: string | null
  status: AccountStatus
  notes: string | null
  created_at: string
}

export interface MoneyBalance {
  id: string
  user_id: string
  account_id: string
  as_of: string
  balance: number
  source: BalanceSource
  document_id: string | null
  notes: string | null
  created_at: string
}

export interface MoneyDocument {
  id: string
  user_id: string
  name: string
  kind: MoneyDocumentKind
  storage_path: string
  file_size_bytes: number | null
  extracted_balance_count: number
  created_at: string
}

/** 'low' means the model was unsure — the row is held for confirmation. */
export type Confidence = 'high' | 'low'

export interface ExtractedBalance {
  account_name: string
  balance: number
  as_of: string | null
  currency: string | null
  confidence: Confidence
  /** Resolved server-side against money_accounts; null when no match. */
  account_id: string | null
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add lib/money/types.ts
git commit -m "feat: money types with liability kinds derived from account kind"
```

---

## Task 3: Net worth derivation (the heart of this feature)

**Files:**
- Create: `lib/money/net-worth.ts`
- Test: `__tests__/lib/money/net-worth.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { buildNetWorthSeries } from '@/lib/money/net-worth'
import type { MoneyAccount, MoneyBalance } from '@/lib/money/types'

const acct = (over: Partial<MoneyAccount> & { id: string }): MoneyAccount => ({
  user_id: 'u', name: over.id, institution: null, kind: 'savings',
  currency: 'GBP', opened_date: null, closed_date: null, status: 'active',
  notes: null, created_at: '2025-01-01T00:00:00Z', ...over,
})

const bal = (account_id: string, as_of: string, balance: number): MoneyBalance => ({
  id: `${account_id}-${as_of}`, user_id: 'u', account_id, as_of, balance,
  source: 'manual', document_id: null, notes: null,
  created_at: `${as_of}T00:00:00Z`,
})

describe('buildNetWorthSeries', () => {
  it('returns an empty series when there are no balances', () => {
    const r = buildNetWorthSeries([acct({ id: 'a' })], [])
    expect(r.points).toEqual([])
    expect(r.currencyWarning).toBeNull()
  })

  it('sums a single account on a single date', () => {
    const r = buildNetWorthSeries([acct({ id: 'a' })], [bal('a', '2025-01-31', 1000)])
    expect(r.points).toHaveLength(1)
    expect(r.points[0]).toMatchObject({
      date: '2025-01-31', assets: 1000, liabilities: 0, net: 1000,
      accountsCounted: 1, accountsTotal: 1,
    })
  })

  it('subtracts liabilities instead of adding them', () => {
    const r = buildNetWorthSeries(
      [acct({ id: 'a', kind: 'savings' }), acct({ id: 'm', kind: 'mortgage' })],
      [bal('a', '2025-01-31', 50_000), bal('m', '2025-01-31', 200_000)],
    )
    expect(r.points[0]).toMatchObject({ assets: 50_000, liabilities: 200_000, net: -150_000 })
  })

  it('does NOT count an account before its first snapshot', () => {
    // The pension appears in March. January must not treat it as zero, which
    // would draw a fake step-change in net worth.
    const r = buildNetWorthSeries(
      [acct({ id: 'a' }), acct({ id: 'p', kind: 'pension' })],
      [bal('a', '2025-01-31', 1000), bal('p', '2025-03-31', 20_000)],
    )
    expect(r.points[0]).toMatchObject({ date: '2025-01-31', net: 1000, accountsCounted: 1 })
    expect(r.points[1]).toMatchObject({ date: '2025-03-31', net: 21_000, accountsCounted: 2 })
    expect(r.points[0].accountsTotal).toBe(2)
  })

  it('carries the last known balance forward', () => {
    const r = buildNetWorthSeries(
      [acct({ id: 'a' }), acct({ id: 'b' })],
      [bal('a', '2025-01-31', 1000), bal('b', '2025-01-31', 500), bal('b', '2025-02-28', 700)],
    )
    // 'a' has no February reading, so January's 1000 still counts.
    expect(r.points[1]).toMatchObject({ date: '2025-02-28', net: 1700, accountsCounted: 2 })
  })

  it('drops a closed account after its closed_date but keeps earlier history', () => {
    const r = buildNetWorthSeries(
      [acct({ id: 'a' }), acct({ id: 'z', status: 'closed', closed_date: '2025-02-01' })],
      [bal('a', '2025-01-31', 1000), bal('z', '2025-01-31', 300), bal('a', '2025-03-31', 1100)],
    )
    expect(r.points[0]).toMatchObject({ date: '2025-01-31', net: 1300, accountsCounted: 2 })
    expect(r.points[1]).toMatchObject({ date: '2025-03-31', net: 1100, accountsCounted: 1 })
  })

  it('resolves two balances on one date to the newest written', () => {
    const older = { ...bal('a', '2025-01-31', 1000), created_at: '2025-02-01T10:00:00Z' }
    const newer = { ...bal('a', '2025-01-31', 1234), created_at: '2025-02-02T10:00:00Z' }
    const r = buildNetWorthSeries([acct({ id: 'a' })], [older, newer])
    expect(r.points).toHaveLength(1)
    expect(r.points[0].net).toBe(1234)
  })

  it('refuses to sum mixed currencies and warns instead', () => {
    const r = buildNetWorthSeries(
      [acct({ id: 'a', currency: 'GBP' }), acct({ id: 'u', currency: 'USD' })],
      [bal('a', '2025-01-31', 1000), bal('u', '2025-01-31', 1000)],
    )
    expect(r.currencyWarning).toMatch(/GBP/)
    expect(r.currencyWarning).toMatch(/USD/)
    expect(r.points).toEqual([])
  })

  it('ignores balances belonging to an unknown account', () => {
    const r = buildNetWorthSeries([acct({ id: 'a' })], [bal('ghost', '2025-01-31', 999)])
    expect(r.points).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/lib/money/net-worth.test.ts`
Expected: FAIL — "Cannot find module '@/lib/money/net-worth'".

- [ ] **Step 3: Implement**

```ts
import { isLiability, type MoneyAccount, type MoneyBalance } from './types'

export interface NetWorthPoint {
  date: string
  assets: number
  liabilities: number
  net: number
  /** Accounts with a known balance on this date. */
  accountsCounted: number
  /** Accounts on record at all, so the UI can say "12 of 14". */
  accountsTotal: number
}

export interface NetWorthSeries {
  points: NetWorthPoint[]
  /** Non-null when accounts span more than one currency; points is then empty. */
  currencyWarning: string | null
}

/** Money in pennies while summing, so repeated addition cannot drift. */
const toPence = (n: number) => Math.round(n * 100)

/**
 * Net worth over time from dated balance snapshots.
 *
 * Each account's last known balance is carried forward until superseded, and an
 * account is excluded until its first snapshot exists — counting it as zero
 * beforehand would draw a step-change that never happened. This is the same
 * trap the pill tracker hit by scoring a medicine on days outside its
 * prescription window.
 */
export function buildNetWorthSeries(
  accounts: MoneyAccount[],
  balances: MoneyBalance[],
): NetWorthSeries {
  const byId = new Map(accounts.map(a => [a.id, a]))

  // Mixed currencies cannot be summed without FX rates, and a silently wrong
  // headline number is worse than an admitted gap.
  const currencies = [...new Set(accounts.map(a => a.currency))].sort()
  if (currencies.length > 1) {
    return {
      points: [],
      currencyWarning:
        `Accounts span ${currencies.join(', ')}. Net worth needs a single currency — ` +
        `convert them or track each currency separately.`,
    }
  }

  // Drop orphans up front so an account deleted mid-flight can't skew a date.
  const known = balances.filter(b => byId.has(b.account_id))
  if (known.length === 0) return { points: [], currencyWarning: null }

  // One balance per account per date; the newest write wins. The unique index
  // should prevent duplicates, but the reader must not depend on that.
  const latestPerAccountDate = new Map<string, MoneyBalance>()
  for (const b of known) {
    const key = `${b.account_id}|${b.as_of}`
    const seen = latestPerAccountDate.get(key)
    if (!seen || b.created_at > seen.created_at) latestPerAccountDate.set(key, b)
  }

  const rows = [...latestPerAccountDate.values()]
  const dates = [...new Set(rows.map(r => r.as_of))].sort()

  // Ascending per account, so a forward scan can track "latest so far".
  const perAccount = new Map<string, MoneyBalance[]>()
  for (const r of rows) {
    const arr = perAccount.get(r.account_id) ?? []
    arr.push(r)
    perAccount.set(r.account_id, arr)
  }
  for (const arr of perAccount.values()) arr.sort((x, y) => x.as_of.localeCompare(y.as_of))

  const points: NetWorthPoint[] = dates.map(date => {
    let assets = 0
    let liabilities = 0
    let counted = 0

    for (const [accountId, arr] of perAccount) {
      const account = byId.get(accountId)!
      if (account.closed_date && date > account.closed_date) continue

      // Last snapshot at or before this date; none means the account did not
      // exist for us yet and must not contribute.
      let current: MoneyBalance | null = null
      for (const b of arr) {
        if (b.as_of > date) break
        current = b
      }
      if (!current) continue

      counted++
      const pence = toPence(Number(current.balance))
      if (isLiability(account.kind)) liabilities += pence
      else assets += pence
    }

    return {
      date,
      assets: assets / 100,
      liabilities: liabilities / 100,
      net: (assets - liabilities) / 100,
      accountsCounted: counted,
      accountsTotal: accounts.length,
    }
  })

  return { points, currencyWarning: null }
}

/** Convenience for the headline figure. */
export function latestNetWorth(series: NetWorthSeries): NetWorthPoint | null {
  return series.points.length ? series.points[series.points.length - 1] : null
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/lib/money/net-worth.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/money/net-worth.ts __tests__/lib/money/net-worth.test.ts
git commit -m "feat: net worth series from balance snapshots

Carries each account's last known balance forward and excludes an account
before its first snapshot, so adding a pension in March cannot invent a
step-change in January's net worth."
```

---

## Task 4: Accounts list and create

**Files:**
- Create: `app/api/money/accounts/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ACCOUNT_KINDS } from '@/lib/money/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('money_accounts')
    .select('*')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  if (!ACCOUNT_KINDS.includes(body.kind)) {
    return NextResponse.json(
      { error: `kind must be one of: ${ACCOUNT_KINDS.join(', ')}` },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('money_accounts')
    .insert({
      user_id: user.id,
      name,
      institution: body.institution || null,
      kind: body.kind,
      currency: (body.currency || 'GBP').toUpperCase(),
      opened_date: body.opened_date || null,
      notes: body.notes || null,
    })
    .select()
    .single()

  if (error) {
    const dup = error.code === '23505' || /duplicate key/i.test(error.message)
    return NextResponse.json(
      { error: dup ? 'An active account already has that name.' : error.message },
      { status: dup ? 409 : 500 },
    )
  }
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/api/money/accounts/route.ts
git commit -m "feat: money accounts list and create endpoints"
```

---

## Task 5: Account edit, close and delete

**Files:**
- Create: `app/api/money/accounts/[id]/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ACCOUNT_KINDS, ACCOUNT_STATUSES } from '@/lib/money/types'

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
    if (!ACCOUNT_KINDS.includes(body.kind)) {
      return NextResponse.json({ error: `kind must be one of: ${ACCOUNT_KINDS.join(', ')}` }, { status: 400 })
    }
    patch.kind = body.kind
  }
  if (body.status !== undefined) {
    if (!ACCOUNT_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "status must be 'active' or 'closed'." }, { status: 400 })
    }
    patch.status = body.status
  }
  for (const k of ['institution', 'notes'] as const) {
    if (body[k] !== undefined) patch[k] = body[k] || null
  }
  if (body.currency !== undefined) patch.currency = String(body.currency).toUpperCase()
  if (body.opened_date !== undefined) patch.opened_date = body.opened_date || null
  if (body.closed_date !== undefined) patch.closed_date = body.closed_date || null

  // Closing implies an end date and reopening clears it. Derived here so no
  // caller can forget: the Medicines tab's Stop button sent `status` alone and
  // left `end_date` null, which kept a stopped drug in the adherence
  // denominator. `closed_date` feeds the net worth series the same way.
  if (patch.status !== undefined && body.closed_date === undefined) {
    patch.closed_date = patch.status === 'closed'
      ? new Date().toISOString().slice(0, 10)
      : null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('money_accounts')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) {
    const dup = error.code === '23505' || /duplicate key/i.test(error.message)
    return NextResponse.json(
      { error: dup ? 'An active account already has that name.' : error.message },
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

  // money_balances cascades on account_id, so this removes the account's whole
  // balance history. Closing is the right move for an account that simply
  // ended; the UI must say so before calling this.
  const { error, count } = await supabase
    .from('money_accounts')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "app/api/money/accounts/[id]/route.ts"
git commit -m "feat: money account edit, close and delete

closed_date is derived server-side when status flips, so no caller can leave a
closed account counting toward net worth forever."
```

---

## Task 6: Balances list and upsert

**Files:**
- Create: `app/api/money/balances/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { BALANCE_SOURCES } from '@/lib/money/types'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountId = new URL(req.url).searchParams.get('account_id')

  // Paged: PostgREST caps at 1000 rows by default, and a truncated net worth
  // series looks self-consistent, so it is worse than an error.
  const PAGE = 1000
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('money_balances')
      .select('*')
      .order('as_of', { ascending: true })
      .range(from, from + PAGE - 1)
    if (accountId) q = q.eq('account_id', accountId)

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
  if (!body.account_id) {
    return NextResponse.json({ error: 'account_id is required.' }, { status: 400 })
  }
  if (!body.as_of) {
    return NextResponse.json({ error: 'as_of is required.' }, { status: 400 })
  }

  const balance = Number(body.balance)
  if (body.balance === null || body.balance === undefined || body.balance === '' || !Number.isFinite(balance)) {
    return NextResponse.json({ error: 'balance must be a number.' }, { status: 400 })
  }

  const asOf = String(body.as_of).slice(0, 10)
  // A balance dated in the future is a typo, not intent.
  if (asOf > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ error: 'A balance cannot be dated in the future.' }, { status: 400 })
  }

  // Confirm the account is the caller's; RLS would block a foreign insert but
  // the error would be opaque.
  const { data: account } = await supabase
    .from('money_accounts')
    .select('id')
    .eq('id', body.account_id)
    .maybeSingle()
  if (!account) return NextResponse.json({ error: 'Unknown account.' }, { status: 400 })

  const source = BALANCE_SOURCES.includes(body.source) ? body.source : 'manual'

  const { data, error } = await supabase
    .from('money_balances')
    .upsert({
      user_id: user.id,
      account_id: body.account_id,
      as_of: asOf,
      balance: Math.round(balance * 100) / 100,
      source,
      document_id: body.document_id || null,
      notes: body.notes || null,
    }, { onConflict: 'user_id,account_id,as_of' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/api/money/balances/route.ts
git commit -m "feat: money balances list (paged) and upsert"
```

---

## Task 7: Balance edit and delete

**Files:**
- Create: `app/api/money/balances/[id]/route.ts`

- [ ] **Step 1: Write the route**

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

  if (body.balance !== undefined) {
    const n = Number(body.balance)
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: 'balance must be a number.' }, { status: 400 })
    }
    patch.balance = Math.round(n * 100) / 100
  }
  if (body.as_of !== undefined) {
    const asOf = String(body.as_of).slice(0, 10)
    if (asOf > new Date().toISOString().slice(0, 10)) {
      return NextResponse.json({ error: 'A balance cannot be dated in the future.' }, { status: 400 })
    }
    patch.as_of = asOf
  }
  if (body.notes !== undefined) patch.notes = body.notes || null

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('money_balances')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) {
    const dup = error.code === '23505' || /duplicate key/i.test(error.message)
    return NextResponse.json(
      { error: dup ? 'That account already has a balance on that date.' : error.message },
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

  const { error, count } = await supabase
    .from('money_balances')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "app/api/money/balances/[id]/route.ts"
git commit -m "feat: money balance edit and delete"
```

---

## Task 8: Account name matching for ingest

**Files:**
- Create: `lib/money/match-account.ts`
- Test: `__tests__/lib/money/match-account.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { buildAccountResolver } from '@/lib/money/match-account'

const ACCOUNTS = [
  { id: '1', name: 'Barclays Current', institution: 'Barclays' },
  { id: '2', name: 'Barclays Savings', institution: 'Barclays' },
  { id: '3', name: 'Vanguard ISA', institution: 'Vanguard' },
  { id: '4', name: 'Halifax Mortgage', institution: 'Halifax' },
]

describe('buildAccountResolver', () => {
  const resolve = buildAccountResolver(ACCOUNTS)

  it('matches an exact name', () => {
    expect(resolve('Barclays Current')?.id).toBe('1')
  })

  it('is case and punctuation insensitive', () => {
    expect(resolve('barclays  current!')?.id).toBe('1')
  })

  it('tolerates a small typo', () => {
    expect(resolve('Barclays Currnet')?.id).toBe('1')
  })

  it('distinguishes two accounts at the same institution', () => {
    expect(resolve('Barclays Savings')?.id).toBe('2')
  })

  it('returns null rather than guessing when only the institution matches', () => {
    // "Barclays" alone cannot choose between Current and Savings, and picking
    // one would file a balance against the wrong account.
    expect(resolve('Barclays')).toBeNull()
  })

  it('returns null for something absent', () => {
    expect(resolve('Monzo')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/lib/money/match-account.test.ts`
Expected: FAIL — "Cannot find module '@/lib/money/match-account'".

- [ ] **Step 3: Implement**

```ts
import { editDistance } from '@/lib/health/match-medicine'

export interface AccountRef {
  id: string
  name: string
  institution?: string | null
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const tokens = (s: string) => normalise(s).split(' ').filter(Boolean)

/**
 * Resolves a name read off a statement to an account on record.
 *
 * Ambiguity returns null rather than a best guess: two accounts at the same
 * bank are common, and filing a balance against the wrong one silently corrupts
 * the net worth series from that date forward.
 */
export function buildAccountResolver(accounts: AccountRef[]) {
  const prepared = accounts.map(a => ({
    account: a,
    tokens: [...new Set([...tokens(a.name), ...tokens(a.institution ?? '')])],
  }))

  return function resolve(raw: string): AccountRef | null {
    const want = tokens(raw)
    if (want.length === 0) return null

    const scored = prepared.map(p => {
      let score = 0
      for (const w of want) {
        const hit = p.tokens.some(t =>
          t === w || (t.length >= 5 && w.length >= 5 && editDistance(t, w) <= 1))
        if (hit) score++
      }
      // Reward covering the account's own distinguishing words, so "Barclays"
      // does not score as highly against "Barclays Current" as the full name.
      const coverage = p.tokens.filter(t =>
        want.some(w => t === w || (t.length >= 5 && w.length >= 5 && editDistance(t, w) <= 1))
      ).length
      return { account: p.account, score, coverage, need: p.tokens.length }
    }).filter(s => s.score > 0)

    if (scored.length === 0) return null

    scored.sort((a, b) => (b.score - a.score) || (b.coverage - a.coverage))
    const best = scored[0]

    // A single shared token (e.g. just the bank name) is not identification.
    if (best.score < 2 && best.need > 1) return null

    // Two candidates tied on both measures cannot be separated.
    const rival = scored[1]
    if (rival && rival.score === best.score && rival.coverage === best.coverage) return null

    return best.account
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/lib/money/match-account.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/money/match-account.ts __tests__/lib/money/match-account.test.ts
git commit -m "feat: account name resolver that returns null on ambiguity"
```

---

## Task 9: CSV import parsing

**Files:**
- Create: `lib/money/parse-csv.ts`
- Test: `__tests__/lib/money/parse-csv.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { parseBalanceCsv } from '@/lib/money/parse-csv'

describe('parseBalanceCsv', () => {
  it('parses account, date and balance', () => {
    const r = parseBalanceCsv('Account,Date,Balance\nBarclays Current,2025-01-31,1234.56')
    expect(r.rows).toEqual([
      { account_name: 'Barclays Current', as_of: '2025-01-31', balance: 1234.56 },
    ])
    expect(r.errors).toEqual([])
  })

  it('reads the calendar day from local parts, not UTC', () => {
    // "January 31, 2025" parses to LOCAL midnight. Reading UTC parts would
    // shift it to the 30th in any timezone ahead of UTC.
    const r = parseBalanceCsv('Account,Date,Balance\nA,"January 31, 2025",10')
    expect(r.rows[0].as_of).toBe('2025-01-31')
  })

  it('strips currency symbols and thousands separators', () => {
    const r = parseBalanceCsv('Account,Date,Balance\nA,2025-01-31,"£1,234.56"')
    expect(r.rows[0].balance).toBe(1234.56)
  })

  it('reads a parenthesised amount as negative', () => {
    const r = parseBalanceCsv('Account,Date,Balance\nA,2025-01-31,(500.00)')
    expect(r.rows[0].balance).toBe(-500)
  })

  it('reports an unreadable date instead of dropping the row silently', () => {
    const r = parseBalanceCsv('Account,Date,Balance\nA,not-a-date,10')
    expect(r.rows).toEqual([])
    expect(r.errors[0]).toMatch(/date/i)
  })

  it('reports a missing required column', () => {
    const r = parseBalanceCsv('Account,Balance\nA,10')
    expect(r.rows).toEqual([])
    expect(r.errors[0]).toMatch(/date/i)
  })

  it('handles quoted fields containing commas', () => {
    const r = parseBalanceCsv('Account,Date,Balance\n"Smith, J current",2025-01-31,10')
    expect(r.rows[0].account_name).toBe('Smith, J current')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/lib/money/parse-csv.test.ts`
Expected: FAIL — "Cannot find module '@/lib/money/parse-csv'".

- [ ] **Step 3: Implement**

```ts
export interface CsvBalanceRow {
  account_name: string
  as_of: string
  balance: number
}

export interface CsvParseResult {
  rows: CsvBalanceRow[]
  errors: string[]
}

/** Minimal RFC-4180 line splitter: handles quoted fields and escaped quotes. */
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
 * Forms like "January 31, 2025" parse to LOCAL midnight, so the calendar day
 * must be read from local parts. Reading UTC parts here shifts every date back
 * one day in any timezone ahead of UTC — a bug this codebase already hit once
 * in parse-pill-csv.ts.
 */
function toIsoDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // Prefer DD/MM/YYYY over the US reading: this is a UK codebase.
  const slash = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s)
  if (slash) {
    const [, d, m, y] = slash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const parsed = new Date(s)
  if (Number.isNaN(parsed.getTime())) return null
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
}

function toAmount(raw: string): number | null {
  let s = raw.trim()
  if (!s) return null
  // Accountancy convention: (500.00) means -500.
  const negated = /^\((.*)\)$/.exec(s)
  if (negated) s = `-${negated[1]}`
  s = s.replace(/[£$€,\s]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

const HEADER_ALIASES: Record<string, string[]> = {
  account: ['account', 'account name', 'name', 'description'],
  date: ['date', 'as of', 'as_of', 'as at', 'statement date'],
  balance: ['balance', 'amount', 'value', 'closing balance'],
}

export function parseBalanceCsv(text: string): CsvParseResult {
  const errors: string[] = []
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) {
    return { rows: [], errors: ['The file has no data rows.'] }
  }

  const header = splitCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[_-]+/g, ' ').trim())
  const findCol = (key: string) =>
    header.findIndex(h => HEADER_ALIASES[key].includes(h))

  const iAccount = findCol('account')
  const iDate = findCol('date')
  const iBalance = findCol('balance')

  for (const [key, idx] of [['account', iAccount], ['date', iDate], ['balance', iBalance]] as const) {
    if (idx === -1) errors.push(`Could not find a ${key} column. Found: ${header.join(', ')}`)
  }
  if (errors.length) return { rows: [], errors }

  const rows: CsvBalanceRow[] = []
  lines.slice(1).forEach((line, n) => {
    const cells = splitCsvLine(line)
    const name = (cells[iAccount] ?? '').trim()
    const as_of = toIsoDate(cells[iDate] ?? '')
    const balance = toAmount(cells[iBalance] ?? '')

    if (!name) { errors.push(`Row ${n + 2}: no account name.`); return }
    if (!as_of) { errors.push(`Row ${n + 2}: unreadable date "${cells[iDate] ?? ''}".`); return }
    if (balance === null) { errors.push(`Row ${n + 2}: unreadable balance "${cells[iBalance] ?? ''}".`); return }

    rows.push({ account_name: name, as_of, balance })
  })

  return { rows, errors }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/lib/money/parse-csv.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/money/parse-csv.ts __tests__/lib/money/parse-csv.test.ts
git commit -m "feat: balance CSV parser reading dates from local parts"
```

---

## Task 10: Claude extraction from statements and screenshots

**Files:**
- Create: `lib/money/extract.ts`

Read `lib/health/extract.ts` first and follow its structure — same SDK usage, same tool-schema-instead-of-prose approach.

- [ ] **Step 1: Write the extractor**

```ts
import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedBalance } from './types'

const client = new Anthropic()

/**
 * A tool schema, not prose parsing: the model is forced to emit valid JSON of
 * the right shape, so there is no regex over free text that silently changes
 * behaviour when the wording shifts.
 */
const TOOL: Anthropic.Tool = {
  name: 'record_balances',
  description: 'Record every account balance visible in the document.',
  input_schema: {
    type: 'object' as const,
    properties: {
      balances: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            account_name: { type: 'string', description: 'Account name or number as printed.' },
            balance: { type: 'number', description: 'The balance as printed. For a debt, the amount owed as a positive number.' },
            as_of: { type: ['string', 'null'], description: 'YYYY-MM-DD if a date is shown, else null.' },
            currency: { type: ['string', 'null'], description: 'ISO code, e.g. GBP, if shown.' },
            confidence: {
              type: 'string',
              enum: ['high', 'low'],
              description: "'low' if the figure, the account or the date is unclear or inferred.",
            },
          },
          required: ['account_name', 'balance', 'confidence'],
        },
      },
    },
    required: ['balances'],
  },
}

const SYSTEM = `You read financial documents — bank statements, banking app screenshots, pension and mortgage statements — and extract account balances.

Rules:
- Record the balance as printed. For a debt (mortgage, loan, credit card), give the amount owed as a POSITIVE number; the application applies the sign.
- Prefer the closing or current balance over an opening balance or an available-credit figure.
- If a date is not shown, set as_of to null rather than guessing today.
- Mark confidence 'low' whenever the number, the account identity or the date is unclear, cropped or inferred. A wrong balance corrupts every later figure, so err toward 'low'.
- Do not invent accounts that are not visible.`

export async function extractBalances(
  file: { data: string; mediaType: string },
): Promise<ExtractedBalance[]> {
  const isPdf = file.mediaType === 'application/pdf'

  const content: Anthropic.ContentBlockParam[] = [
    isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: file.mediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
            data: file.data,
          },
        },
    { type: 'text', text: 'Extract every account balance you can see.' },
  ]

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_balances' },
    messages: [{ role: 'user', content }],
  })

  const block = res.content.find(b => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') return []

  const raw = (block.input as { balances?: unknown[] }).balances ?? []
  return raw.flatMap((r): ExtractedBalance[] => {
    const row = r as Record<string, unknown>
    const balance = Number(row.balance)
    const name = String(row.account_name ?? '').trim()
    if (!name || !Number.isFinite(balance)) return []
    return [{
      account_name: name,
      balance: Math.round(balance * 100) / 100,
      as_of: row.as_of ? String(row.as_of).slice(0, 10) : null,
      currency: row.currency ? String(row.currency).toUpperCase() : null,
      confidence: row.confidence === 'high' ? 'high' : 'low',
      account_id: null,
    }]
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add lib/money/extract.ts
git commit -m "feat: extract account balances from statements and screenshots"
```

---

## Task 11: Ingest endpoint

**Files:**
- Create: `app/api/money/ingest/route.ts`

Read `app/api/health/ingest/route.ts` first; this mirrors it.

- [ ] **Step 1: Write the route**

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { extractBalances } from '@/lib/money/extract'
import { buildAccountResolver } from '@/lib/money/match-account'
import { parseBalanceCsv } from '@/lib/money/parse-csv'
import type { ExtractedBalance } from '@/lib/money/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 20 * 1024 * 1024

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file supplied.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'That file is over 20MB.' }, { status: 400 })
  }

  const { data: accounts } = await supabase
    .from('money_accounts')
    .select('id, name, institution')
  const resolve = buildAccountResolver(accounts ?? [])

  const bytes = Buffer.from(await file.arrayBuffer())
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv'

  let extracted: ExtractedBalance[]
  let docKind: 'csv' | 'statement' | 'screenshot'

  if (isCsv) {
    const parsed = parseBalanceCsv(bytes.toString('utf8'))
    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: parsed.errors[0] ?? 'Nothing readable in that CSV.' },
        { status: 400 },
      )
    }
    docKind = 'csv'
    // CSV values are typed, not inferred, so the only uncertainty is which
    // account a name refers to.
    extracted = parsed.rows.map(r => ({
      account_name: r.account_name,
      balance: r.balance,
      as_of: r.as_of,
      currency: null,
      confidence: 'high',
      account_id: null,
    }))
  } else {
    docKind = file.type === 'application/pdf' ? 'statement' : 'screenshot'
    extracted = await extractBalances({
      data: bytes.toString('base64'),
      mediaType: file.type || 'image/png',
    })
    if (extracted.length === 0) {
      return NextResponse.json({ error: 'I could not find any balances in that file.' }, { status: 422 })
    }
  }

  // Store the source file so a figure can always be traced back to it.
  const path = `${user.id}/${Date.now()}-${file.name || 'upload'}`
  const { error: upErr } = await supabase.storage
    .from('money-documents')
    .upload(path, bytes, { contentType: file.type || 'application/octet-stream' })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: doc, error: docErr } = await supabase
    .from('money_documents')
    .insert({
      user_id: user.id,
      name: file.name || 'Upload',
      kind: docKind,
      storage_path: path,
      file_size_bytes: file.size,
      extracted_balance_count: extracted.length,
    })
    .select()
    .single()
  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 })

  const today = new Date().toISOString().slice(0, 10)
  const resolved = extracted.map(e => {
    const match = resolve(e.account_name)
    return { ...e, account_id: match?.id ?? null }
  })

  // Auto-apply only rows that are confident, matched to an account, and dated.
  // Everything else is held for review: an unreviewed wrong balance corrupts
  // the whole series from that date forward.
  const applied: unknown[] = []
  const pending: ExtractedBalance[] = []

  for (const r of resolved) {
    const ok = r.confidence === 'high' && r.account_id && r.as_of && r.as_of <= today
    if (!ok) { pending.push(r); continue }

    const { data, error } = await supabase
      .from('money_balances')
      .upsert({
        user_id: user.id,
        account_id: r.account_id,
        as_of: r.as_of,
        balance: r.balance,
        source: isCsv ? 'import' : 'document',
        document_id: doc.id,
      }, { onConflict: 'user_id,account_id,as_of' })
      .select()
      .single()

    if (error) pending.push(r)
    else applied.push(data)
  }

  return NextResponse.json({
    document_id: doc.id,
    applied: applied.length,
    pending,
    unmatched: resolved.filter(r => !r.account_id).map(r => r.account_name),
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/api/money/ingest/route.ts
git commit -m "feat: money ingest for statements, screenshots and CSV

Only confident, account-matched, dated rows auto-apply; the rest are held for
review, because a wrong balance corrupts every later figure in the series."
```

---

## Task 12: Module shell and routes

**Files:**
- Create: `components/money/MoneyShell.tsx`
- Create: `app/(dashboard)/dashboard/money/layout.tsx`
- Create: `app/(dashboard)/dashboard/money/page.tsx`

Read `components/health/HealthShell.tsx` and copy its structure: tab bar across the top, JARVIS sidebar on the left with paste/drag/attach upload, and a `dataVersion` counter used as a `key` on children so a tab refetches after an upload (the pages fetch in `useEffect`, so `router.refresh()` alone does not refetch).

- [ ] **Step 1: Write the shell**

```tsx
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { ExtractedBalance } from '@/lib/money/types'

const TABS = [
  { label: 'Overview', icon: '📊', href: '/dashboard/money/overview' },
  { label: 'Accounts', icon: '🏦', href: '/dashboard/money/accounts' },
  { label: 'History', icon: '🕘', href: '/dashboard/money/history' },
]

interface Msg { role: 'ai' | 'user'; text: string }

export default function MoneyShell({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'ai', text: "I can read a statement or a banking-app screenshot and file the balances. Drop one in, or ask me about your net worth." },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState<ExtractedBalance[]>([])
  const [dataVersion, setDataVersion] = useState(0)

  const fileInput = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, uploading, pending.length])

  const say = (text: string) => setMessages(m => [...m, { role: 'ai', text }])

  const upload = useCallback(async (file: File) => {
    if (uploading) return
    setUploading(true)
    setMessages(m => [...m, { role: 'user', text: `📎 ${file.name || 'screenshot'}` }])
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/money/ingest', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { say(data.error || 'I could not read that file.'); return }

      const bits: string[] = []
      if (data.applied) bits.push(`Filed ${data.applied} balance${data.applied === 1 ? '' : 's'}.`)
      if (data.pending?.length) bits.push(`${data.pending.length} need${data.pending.length === 1 ? 's' : ''} your check below.`)
      if (data.unmatched?.length) bits.push(`No matching account for: ${data.unmatched.join(', ')}. Add the account, then re-upload.`)
      say(bits.join(' ') || 'Nothing to file from that one.')
      setPending(data.pending ?? [])
      // Remount the tab so its useEffect refetches.
      setDataVersion(v => v + 1)
      router.refresh()
    } catch (err) {
      say(`That upload failed: ${String(err)}`)
    } finally {
      setUploading(false)
    }
  }, [uploading, router])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text }])
    setLoading(true)
    try {
      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: text }], context: 'money' }),
      })
      const raw = await res.text()
      let out = ''
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
        try {
          const d = JSON.parse(line.slice(6))
          if (d.type === 'text') out += d.text
        } catch { /* partial frame */ }
      }
      say(out || 'I did not get a reply to that.')
      setDataVersion(v => v + 1)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: '#fff', color: '#111' }}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault(); setDragging(false)
        const f = e.dataTransfer.files?.[0]; if (f) void upload(f)
      }}
    >
      <aside style={{ width: 300, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', fontSize: 12, fontWeight: 700 }}>
          ◉ JARVIS
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              background: m.role === 'ai' ? '#eff6ff' : '#f3f4f6',
              borderRadius: 10, padding: '8px 10px', marginBottom: 8, fontSize: 12, lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>{m.text}</div>
          ))}
          {(loading || uploading) && (
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{uploading ? 'Reading…' : 'Thinking…'}</div>
          )}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid #e5e7eb', display: 'flex', gap: 6 }}>
          <button onClick={() => fileInput.current?.click()} title="Attach a statement or screenshot"
            style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '6px 9px', cursor: 'pointer' }}>
            📎
          </button>
          <input ref={fileInput} type="file" style={{ display: 'none' }}
            accept="image/*,application/pdf,.csv,text/csv"
            onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void send() }}
            onPaste={e => {
              const f = Array.from(e.clipboardData.files)[0]
              if (f) { e.preventDefault(); void upload(f) }
            }}
            placeholder="Ask, or paste a screenshot…"
            style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}
          />
        </div>
      </aside>

      <main style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '14px 22px 0', fontSize: 15, fontWeight: 700 }}>Money</div>
        <nav style={{ display: 'flex', gap: 4, padding: '10px 18px', borderBottom: '1px solid #e5e7eb' }}>
          {TABS.map(t => {
            const active = pathname === t.href
            return (
              <button key={t.href} onClick={() => router.push(t.href)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '6px 12px',
                  fontSize: 11, fontWeight: active ? 700 : 500,
                  color: active ? '#111' : '#6b7280',
                  borderBottom: active ? '2px solid #111' : '2px solid transparent',
                }}>
                <div style={{ fontSize: 16 }}>{t.icon}</div>{t.label}
              </button>
            )
          })}
        </nav>
        {dragging && (
          <div style={{ margin: 18, padding: 20, border: '2px dashed #3b82f6', borderRadius: 12, textAlign: 'center', fontSize: 12, color: '#3b82f6' }}>
            Drop the statement to file it
          </div>
        )}
        <div key={dataVersion}>{children}</div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Write the layout and the root redirect**

`app/(dashboard)/dashboard/money/layout.tsx`:

```tsx
import MoneyShell from '@/components/money/MoneyShell'

export default function MoneyLayout({ children }: { children: React.ReactNode }) {
  return <MoneyShell>{children}</MoneyShell>
}
```

`app/(dashboard)/dashboard/money/page.tsx`:

```tsx
import { redirect } from 'next/navigation'

export default function MoneyRoot() {
  redirect('/dashboard/money/overview')
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add components/money/MoneyShell.tsx "app/(dashboard)/dashboard/money/layout.tsx" "app/(dashboard)/dashboard/money/page.tsx"
git commit -m "feat: money module shell with JARVIS sidebar and upload"
```

> The `pending` state set here is rendered by `PendingReview` in Task 12a. Until that task
> lands, low-confidence extractions are counted in the JARVIS message but not displayed.

---

## Task 12a: Pending review for low-confidence extractions

Without this, the ingest endpoint holds uncertain rows back and **nothing ever shows them** — the
balances are silently discarded, which is worse than auto-applying them, because the user believes
the upload worked.

**Files:**
- Create: `components/money/PendingReview.tsx`
- Modify: `components/money/MoneyShell.tsx` (render it, and pass a refresh callback)

- [ ] **Step 1: Write the component**

```tsx
'use client'
import { useEffect, useState } from 'react'
import type { ExtractedBalance, MoneyAccount } from '@/lib/money/types'

interface Props {
  rows: ExtractedBalance[]
  documentId: string | null
  onDone: (savedCount: number) => void
}

/**
 * Confirms balances the extractor was unsure about, or could not match to an
 * account. Each row must be given an account and a date before it can be saved;
 * a guessed balance would corrupt every later figure in the net worth series.
 */
export default function PendingReview({ rows, documentId, onDone }: Props) {
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [draft, setDraft] = useState(rows.map(r => ({
    account_id: r.account_id ?? '',
    as_of: r.as_of ?? '',
    balance: String(r.balance),
    name: r.account_name,
    skip: false,
  })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/money/accounts').then(r => r.json())
      .then(d => setAccounts(Array.isArray(d) ? d.filter((a: MoneyAccount) => a.status === 'active') : []))
  }, [])

  const set = (i: number, patch: Partial<typeof draft[number]>) =>
    setDraft(d => d.map((row, n) => (n === i ? { ...row, ...patch } : row)))

  async function save() {
    setSaving(true); setError('')
    let saved = 0
    try {
      for (const row of draft) {
        if (row.skip || !row.account_id || !row.as_of) continue
        const res = await fetch('/api/money/balances', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account_id: row.account_id, as_of: row.as_of,
            balance: row.balance, source: 'document', document_id: documentId,
          }),
        })
        if (res.ok) saved++
        else setError((await res.json()).error || 'One row could not be saved.')
      }
      onDone(saved)
    } finally { setSaving(false) }
  }

  const input: React.CSSProperties = {
    border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 6px', fontSize: 11, width: '100%',
  }

  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 10, marginBottom: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
        Needs your check — I wasn&apos;t confident about these
      </p>
      {draft.map((row, i) => (
        <div key={i} style={{ marginBottom: 8, opacity: row.skip ? 0.45 : 1 }}>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>
            read as &ldquo;{row.name}&rdquo;
          </div>
          <select style={input} value={row.account_id} onChange={e => set(i, { account_id: e.target.value })}>
            <option value="">— choose an account —</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
            <input style={input} type="date" value={row.as_of} onChange={e => set(i, { as_of: e.target.value })} />
            <input style={input} value={row.balance} onChange={e => set(i, { balance: e.target.value })} />
          </div>
          <label style={{ fontSize: 10, color: '#6b7280', display: 'flex', gap: 4, marginTop: 3 }}>
            <input type="checkbox" checked={row.skip} onChange={e => set(i, { skip: e.target.checked })} />
            discard this one
          </label>
        </div>
      ))}
      {error && <p style={{ fontSize: 10, color: '#991b1b', marginBottom: 4 }}>{error}</p>}
      <button onClick={save} disabled={saving}
        style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
        {saving ? 'Saving…' : 'Save these'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Render it in the shell**

In `components/money/MoneyShell.tsx`, add the import:

```tsx
import PendingReview from './PendingReview'
```

Track the document id alongside the pending rows. Add the state:

```tsx
  const [pendingDocId, setPendingDocId] = useState<string | null>(null)
```

In `upload`, set it when the response arrives, next to `setPending`:

```tsx
      setPendingDocId(data.document_id ?? null)
```

Then render the block inside the sidebar scroll area, immediately after the `messages.map(...)` block and before the loading indicator:

```tsx
          {pending.length > 0 && (
            <PendingReview
              rows={pending}
              documentId={pendingDocId}
              onDone={saved => {
                setPending([])
                setPendingDocId(null)
                say(saved > 0 ? `Saved ${saved} more.` : 'Nothing else saved.')
                setDataVersion(v => v + 1)
              }}
            />
          )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add components/money/PendingReview.tsx components/money/MoneyShell.tsx
git commit -m "feat: review low-confidence extracted balances before saving

The ingest route holds uncertain rows back; without this they were counted in
the reply but never shown, so they were silently discarded."
```

---

## Task 13: Net worth chart

**Files:**
- Create: `components/money/NetWorthTrend.tsx`

Read `components/health/BloodPressureTrend.tsx` first — same hand-rolled SVG approach, no chart library.

- [ ] **Step 1: Write the component**

```tsx
'use client'
import type { NetWorthPoint } from '@/lib/money/net-worth'

const money = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })

/**
 * Net worth over time. Plots the net line plus assets and liabilities, and
 * always surfaces how many accounts each point is based on — a chart that
 * hides an incomplete denominator invites false confidence.
 */
export default function NetWorthTrend({ points }: { points: NetWorthPoint[] }) {
  if (points.length === 0) {
    return <p style={{ fontSize: 12, color: '#9ca3af' }}>No balances recorded yet.</p>
  }
  if (points.length === 1) {
    const p = points[0]
    return (
      <p style={{ fontSize: 12, color: '#6b7280' }}>
        One snapshot so far — {money(p.net)} on {p.date}. Add another to see a trend.
      </p>
    )
  }

  const W = 720, H = 220, PAD = 40
  const values = points.flatMap(p => [p.net, p.assets, -p.liabilities])
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  const span = max - min || 1

  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2)
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2)

  const path = (get: (p: NetWorthPoint) => number) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(get(p))}`).join(' ')

  const incomplete = points.some(p => p.accountsCounted < p.accountsTotal)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {/* zero line, so a negative net worth is unmistakable */}
        <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="#d1d5db" strokeDasharray="3 3" />
        <path d={path(p => p.assets)} fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.7" />
        <path d={path(p => -p.liabilities)} fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.7" />
        <path d={path(p => p.net)} fill="none" stroke="#111" strokeWidth="2.5" />
        {points.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.net)} r="3" fill="#111">
            <title>{`${p.date}: ${money(p.net)} (${p.accountsCounted}/${p.accountsTotal} accounts)`}</title>
          </circle>
        ))}
        <text x={PAD} y={16} fontSize="10" fill="#9ca3af">{money(max)}</text>
        <text x={PAD} y={H - 8} fontSize="10" fill="#9ca3af">{money(min)}</text>
        <text x={W - PAD} y={H - 8} fontSize="10" fill="#9ca3af" textAnchor="end">
          {points[points.length - 1].date}
        </text>
      </svg>
      <div style={{ display: 'flex', gap: 14, fontSize: 10, color: '#6b7280' }}>
        <span>— net worth</span>
        <span style={{ color: '#10b981' }}>— assets</span>
        <span style={{ color: '#ef4444' }}>— debts</span>
      </div>
      {incomplete && (
        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>
          Some points cover fewer accounts than you hold — an account only counts once it has a
          balance on or before that date.
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
git add components/money/NetWorthTrend.tsx
git commit -m "feat: net worth SVG chart showing assets, debts and coverage"
```

---

## Task 14: Overview page

**Files:**
- Create: `app/(dashboard)/dashboard/money/overview/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
'use client'
import { useEffect, useState } from 'react'
import NetWorthTrend from '@/components/money/NetWorthTrend'
import { buildNetWorthSeries, latestNetWorth } from '@/lib/money/net-worth'
import { ACCOUNT_KIND_LABEL, isLiability, type MoneyAccount, type MoneyBalance } from '@/lib/money/types'

const money = (n: number, ccy = 'GBP') =>
  n.toLocaleString('en-GB', { style: 'currency', currency: ccy, maximumFractionDigits: 2 })

export default function MoneyOverviewPage() {
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [balances, setBalances] = useState<MoneyBalance[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/money/accounts').then(r => r.json()),
      fetch('/api/money/balances').then(r => r.json()),
    ]).then(([a, b]) => {
      setAccounts(Array.isArray(a) ? a : [])
      setBalances(Array.isArray(b) ? b : [])
      setLoading(false)
    })
  }, [])

  if (loading) return <div style={{ padding: 40, fontSize: 12, color: '#9ca3af' }}>Loading…</div>

  if (accounts.length === 0) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🏦</div>
      <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>No accounts yet</p>
      <p style={{ fontSize: 12, color: '#6b7280' }}>Add one in the Accounts tab to start tracking net worth.</p>
    </div>
  )

  const series = buildNetWorthSeries(accounts, balances)
  const latest = latestNetWorth(series)

  // Latest known balance per account, for the account cards.
  const latestFor = (id: string) => {
    const rows = balances.filter(b => b.account_id === id)
    if (rows.length === 0) return null
    return rows.reduce((a, b) => (a.as_of >= b.as_of ? a : b))
  }

  const live = accounts.filter(a => a.status === 'active')
  const assets = live.filter(a => !isLiability(a.kind))
  const debts = live.filter(a => isLiability(a.kind))

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px',
  }

  const Group = ({ title, items }: { title: string; items: MoneyAccount[] }) => (
    <div style={{ ...card, marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{title}</h3>
      {items.length === 0
        ? <p style={{ fontSize: 11, color: '#9ca3af' }}>None recorded.</p>
        : items.map(a => {
            const b = latestFor(a.id)
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid #f9fafb' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{a.name}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>
                    {ACCOUNT_KIND_LABEL[a.kind]}{a.institution ? ` · ${a.institution}` : ''}
                    {b ? ` · as of ${b.as_of}` : ' · no balance yet'}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {b ? money(Number(b.balance), a.currency) : '—'}
                </div>
              </div>
            )
          })}
    </div>
  )

  return (
    <div style={{ padding: '20px 22px' }}>
      {series.currencyWarning && (
        <div style={{ ...card, marginBottom: 16, background: '#fffbeb', borderColor: '#fde68a' }}>
          <p style={{ fontSize: 12, color: '#92400e' }}>{series.currencyWarning}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{latest ? money(latest.net) : '—'}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Net worth</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#059669' }}>{latest ? money(latest.assets) : '—'}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Assets</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626' }}>{latest ? money(latest.liabilities) : '—'}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Debts</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {latest ? `${latest.accountsCounted}/${latest.accountsTotal}` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Accounts counted</div>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Net worth over time</h3>
        <NetWorthTrend points={series.points} />
      </div>

      <Group title="Assets" items={assets} />
      <Group title="Debts" items={debts} />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/money/overview/page.tsx"
git commit -m "feat: money overview with net worth headline, chart and account groups"
```

---

## Task 15: Accounts page

**Files:**
- Create: `app/(dashboard)/dashboard/money/accounts/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABEL, type AccountKind, type MoneyAccount } from '@/lib/money/types'

export default function MoneyAccountsPage() {
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [institution, setInstitution] = useState('')
  const [kind, setKind] = useState<AccountKind>('current')

  const [balanceFor, setBalanceFor] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))

  const load = () =>
    fetch('/api/money/accounts').then(r => r.json()).then(d => {
      setAccounts(Array.isArray(d) ? d : [])
      setLoading(false)
    })

  useEffect(() => { void load() }, [])

  async function addAccount() {
    setError('')
    const res = await fetch('/api/money/accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, institution, kind }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not add that account.')
    setName(''); setInstitution('')
    await load()
  }

  async function setStatus(a: MoneyAccount, status: 'active' | 'closed') {
    setBusy(a.id); setError('')
    try {
      const res = await fetch(`/api/money/accounts/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not update.')
      await load()
    } finally { setBusy(null) }
  }

  async function remove(a: MoneyAccount) {
    // Deleting cascades the balance history; closing keeps it. Say so.
    if (!confirm(
      `Delete "${a.name}" and its entire balance history?\n\n` +
      `If the account simply closed, use Close instead — that keeps the history in your net worth trend.`
    )) return
    setBusy(a.id)
    try {
      const res = await fetch(`/api/money/accounts/${a.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not delete.')
      await load()
    } finally { setBusy(null) }
  }

  async function addBalance(accountId: string) {
    setError('')
    const res = await fetch('/api/money/balances', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, as_of: asOf, balance: amount, source: 'manual' }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not save that balance.')
    setAmount(''); setBalanceFor(null)
  }

  if (loading) return <div style={{ padding: 40, fontSize: 12, color: '#9ca3af' }}>Loading…</div>

  const input: React.CSSProperties = {
    border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', fontSize: 12,
  }
  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16,
  }

  return (
    <div style={{ padding: '20px 22px' }}>
      {error && (
        <div style={{ ...card, background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b', fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Add an account</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={input} placeholder="Name, e.g. Barclays Current" value={name} onChange={e => setName(e.target.value)} />
          <input style={input} placeholder="Institution" value={institution} onChange={e => setInstitution(e.target.value)} />
          <select style={input} value={kind} onChange={e => setKind(e.target.value as AccountKind)}>
            {ACCOUNT_KINDS.map(k => <option key={k} value={k}>{ACCOUNT_KIND_LABEL[k]}</option>)}
          </select>
          <button onClick={addAccount} disabled={!name.trim()}
            style={{ ...input, background: '#111', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            Add
          </button>
        </div>
        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>
          Enter debts as they appear on the statement — a £250,000 mortgage is 250000, not negative.
        </p>
      </div>

      {(['active', 'closed'] as const).map(status => {
        const items = accounts.filter(a => a.status === status)
        return (
          <div key={status} style={card}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: 'capitalize' }}>{status}</h3>
            {items.length === 0
              ? <p style={{ fontSize: 11, color: '#9ca3af' }}>None.</p>
              : items.map(a => (
                <div key={a.id} style={{ padding: '9px 0', borderBottom: '1px solid #f9fafb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af' }}>
                        {ACCOUNT_KIND_LABEL[a.kind]}{a.institution ? ` · ${a.institution}` : ''} · {a.currency}
                        {a.closed_date ? ` · closed ${a.closed_date}` : ''}
                      </div>
                    </div>
                    <button onClick={() => setBalanceFor(balanceFor === a.id ? null : a.id)}
                      style={{ ...input, cursor: 'pointer', background: '#fff' }}>
                      Balance
                    </button>
                    {status === 'active'
                      ? <button onClick={() => setStatus(a, 'closed')} disabled={busy === a.id}
                          title="Keeps the balance history" style={{ ...input, cursor: 'pointer', background: '#fff' }}>Close</button>
                      : <button onClick={() => setStatus(a, 'active')} disabled={busy === a.id}
                          style={{ ...input, cursor: 'pointer', background: '#fff' }}>Reopen</button>}
                    <button onClick={() => remove(a)} disabled={busy === a.id}
                      style={{ ...input, cursor: 'pointer', background: '#fff', color: '#dc2626' }}>Delete</button>
                  </div>
                  {balanceFor === a.id && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input style={input} type="date" value={asOf} onChange={e => setAsOf(e.target.value)} />
                      <input style={input} placeholder="Balance" value={amount} onChange={e => setAmount(e.target.value)} />
                      <button onClick={() => addBalance(a.id)} disabled={!amount.trim()}
                        style={{ ...input, background: '#111', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                        Save
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/money/accounts/page.tsx"
git commit -m "feat: money accounts page with close-vs-delete distinction"
```

---

## Task 16: History page

**Files:**
- Create: `app/(dashboard)/dashboard/money/history/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
'use client'
import { useEffect, useState } from 'react'
import type { MoneyAccount, MoneyBalance } from '@/lib/money/types'

const money = (n: number, ccy = 'GBP') =>
  n.toLocaleString('en-GB', { style: 'currency', currency: ccy, maximumFractionDigits: 2 })

export default function MoneyHistoryPage() {
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [balances, setBalances] = useState<MoneyBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => Promise.all([
    fetch('/api/money/accounts').then(r => r.json()),
    fetch('/api/money/balances').then(r => r.json()),
  ]).then(([a, b]) => {
    setAccounts(Array.isArray(a) ? a : [])
    setBalances(Array.isArray(b) ? b : [])
    setLoading(false)
  })

  useEffect(() => { void load() }, [])

  async function remove(id: string) {
    if (!confirm('Delete this balance snapshot?')) return
    const res = await fetch(`/api/money/balances/${id}`, { method: 'DELETE' })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not delete.')
    await load()
  }

  if (loading) return <div style={{ padding: 40, fontSize: 12, color: '#9ca3af' }}>Loading…</div>
  if (balances.length === 0) return (
    <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: '#6b7280' }}>
      No balance snapshots yet.
    </div>
  )

  const nameOf = (id: string) => accounts.find(a => a.id === id)?.name ?? 'Unknown account'
  const ccyOf = (id: string) => accounts.find(a => a.id === id)?.currency ?? 'GBP'
  const rows = [...balances].sort((a, b) => b.as_of.localeCompare(a.as_of))

  const cell: React.CSSProperties = { padding: '9px 14px', borderBottom: '1px solid #f9fafb', fontSize: 12 }

  return (
    <div style={{ padding: '20px 22px' }}>
      {error && <p style={{ fontSize: 12, color: '#991b1b', marginBottom: 10 }}>{error}</p>}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Date', 'Account', 'Balance', 'Source', ''].map(h => (
                <th key={h} style={{
                  textAlign: h === 'Balance' ? 'right' : 'left', padding: '8px 14px',
                  background: '#fafafa', color: '#9ca3af', fontWeight: 600, fontSize: 11,
                  borderBottom: '1px solid #f3f4f6',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(b => (
              <tr key={b.id}>
                <td style={cell}>{b.as_of}</td>
                <td style={{ ...cell, fontWeight: 600 }}>{nameOf(b.account_id)}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{money(Number(b.balance), ccyOf(b.account_id))}</td>
                <td style={{ ...cell, color: '#9ca3af' }}>{b.source}</td>
                <td style={cell}>
                  <button onClick={() => remove(b.id)}
                    style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '3px 8px', fontSize: 10, color: '#dc2626', cursor: 'pointer' }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/money/history/page.tsx"
git commit -m "feat: money history page listing and deleting snapshots"
```

---

## Task 17: JARVIS money tools

**Files:**
- Create: `lib/money/jarvis-tools.ts`
- Modify: `lib/jarvis-tools.ts:5` (import) and `lib/jarvis-tools.ts:53` (TOOLS array) and the `executeTool` body around `lib/jarvis-tools.ts:60`

- [ ] **Step 1: Write the tools**

```ts
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildNetWorthSeries, latestNetWorth } from './net-worth'
import { buildAccountResolver } from './match-account'
import type { MoneyAccount, MoneyBalance } from './types'

export const MONEY_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_accounts',
    description: 'Financial accounts on record with kind, institution, currency and latest known balance.',
    input_schema: {
      type: 'object' as const,
      properties: { include_closed: { type: 'boolean', description: 'Default false.' } },
      required: [],
    },
  },
  {
    name: 'get_net_worth',
    description: 'Current net worth plus assets, debts and how it has changed over time.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_balance_history',
    description: 'Every recorded balance for one account, oldest first.',
    input_schema: {
      type: 'object' as const,
      properties: { account_name: { type: 'string' } },
      required: ['account_name'],
    },
  },
  {
    name: 'add_balance',
    description:
      'Record a balance for an account on a date. Names are matched loosely. If the name matches ' +
      'more than one account the tool returns the candidates instead of guessing — relay them and ask.',
    input_schema: {
      type: 'object' as const,
      properties: {
        account_name: { type: 'string' },
        balance: { type: 'number', description: 'As printed. For a debt, the amount owed as a positive number.' },
        as_of: { type: 'string', description: 'YYYY-MM-DD.' },
      },
      required: ['account_name', 'balance', 'as_of'],
    },
  },
]

export const MONEY_TOOL_NAMES = new Set(MONEY_TOOLS.map(t => t.name))

const json = (v: unknown) => JSON.stringify(v, null, 2)

async function loadAll(supabase: SupabaseClient) {
  const [{ data: accounts }, { data: balances }] = await Promise.all([
    supabase.from('money_accounts').select('*'),
    supabase.from('money_balances').select('*').order('as_of', { ascending: true }),
  ])
  return {
    accounts: (accounts ?? []) as MoneyAccount[],
    balances: (balances ?? []) as MoneyBalance[],
  }
}

export async function executeMoneyTool(
  name: string,
  input: Record<string, unknown>,
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  if (name === 'get_accounts') {
    const { accounts, balances } = await loadAll(supabase)
    const list = input.include_closed ? accounts : accounts.filter(a => a.status === 'active')
    if (list.length === 0) return 'No accounts on record.'
    return json(list.map(a => {
      const rows = balances.filter(b => b.account_id === a.id)
      const latest = rows.length ? rows.reduce((x, y) => (x.as_of >= y.as_of ? x : y)) : null
      return {
        name: a.name, kind: a.kind, institution: a.institution, currency: a.currency,
        status: a.status,
        latest_balance: latest ? Number(latest.balance) : null,
        latest_balance_as_of: latest?.as_of ?? null,
      }
    }))
  }

  if (name === 'get_net_worth') {
    const { accounts, balances } = await loadAll(supabase)
    const series = buildNetWorthSeries(accounts, balances)
    if (series.currencyWarning) return series.currencyWarning
    const latest = latestNetWorth(series)
    if (!latest) return 'No balances recorded yet, so net worth cannot be calculated.'
    const first = series.points[0]
    return json({
      net_worth: latest.net,
      assets: latest.assets,
      debts: latest.liabilities,
      as_of: latest.date,
      accounts_counted: `${latest.accountsCounted} of ${latest.accountsTotal}`,
      earliest_point: { date: first.date, net: first.net },
      change_since_earliest: Math.round((latest.net - first.net) * 100) / 100,
      points: series.points.length,
    })
  }

  if (name === 'get_balance_history') {
    const { accounts, balances } = await loadAll(supabase)
    const match = buildAccountResolver(accounts)(String(input.account_name ?? ''))
    if (!match) {
      return `No single account matched "${input.account_name}". On record: ${accounts.map(a => a.name).join(', ')}`
    }
    const rows = balances.filter(b => b.account_id === match.id)
    if (rows.length === 0) return `${match.name} has no recorded balances.`
    return json({ account: match.name, history: rows.map(b => ({ as_of: b.as_of, balance: Number(b.balance), source: b.source })) })
  }

  if (name === 'add_balance') {
    const { accounts } = await loadAll(supabase)
    const wanted = String(input.account_name ?? '')
    const match = buildAccountResolver(accounts)(wanted)
    if (!match) {
      return `No single account matched "${wanted}", so nothing was saved. On record: ${accounts.map(a => a.name).join(', ')}. Ask which one is meant.`
    }

    const balance = Number(input.balance)
    if (!Number.isFinite(balance)) return 'The balance was not a number, so nothing was saved.'

    const asOf = String(input.as_of ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return 'as_of must be YYYY-MM-DD. Nothing was saved.'
    if (asOf > new Date().toISOString().slice(0, 10)) {
      return 'That date is in the future, so nothing was saved.'
    }

    const { error } = await supabase.from('money_balances').upsert({
      user_id: userId,
      account_id: match.id,
      as_of: asOf,
      balance: Math.round(balance * 100) / 100,
      source: 'manual',
    }, { onConflict: 'user_id,account_id,as_of' })

    if (error) return `Could not save: ${error.message}`
    return `Recorded ${balance} for ${match.name} as of ${asOf}.`
  }

  return `Unknown money tool: ${name}`
}
```

- [ ] **Step 2: Merge into the shared tool list**

In `lib/jarvis-tools.ts`, add the import beside the health one:

```ts
import { MONEY_TOOLS, MONEY_TOOL_NAMES, executeMoneyTool } from '@/lib/money/jarvis-tools'
```

Change the TOOLS export:

```ts
export const TOOLS: Anthropic.Tool[] = [...BASE_TOOLS, ...HEALTH_TOOLS, ...MONEY_TOOLS]
```

And add a branch at the top of `executeTool`, directly after the health branch:

```ts
  if (MONEY_TOOL_NAMES.has(name)) {
    if (!ctx) return 'Money records are unavailable in this context.'
    return executeMoneyTool(name, input, ctx.supabase, ctx.userId)
  }
```

- [ ] **Step 3: Extend the JARVIS system prompt**

In `app/api/jarvis/route.ts`, the `SYSTEM_PROMPT` lists what JARVIS can see. Add money to that list so it does not claim it has no visibility. After the sentence about health records, add:

```
You also have access to his Money records — financial accounts, their balances over time, and net worth. Use the money tools when asked about accounts, balances or net worth; never claim you cannot see them. You are not a financial adviser: report what the records say, and do not recommend investments or products.
```

And extend the `healthNote` block with a money equivalent:

```ts
  const moneyNote = context === 'money'
    ? `\n\nThe user is viewing their Money records. Questions are most likely about accounts, balances or net worth. They can also upload a statement or a screenshot of a banking app and you will file the balances automatically.`
    : ''
```

Then include it in the final prompt:

```ts
  const systemPrompt = `${SYSTEM_PROMPT}\n${memorySummary}${healthNote}${moneyNote}`
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add lib/money/jarvis-tools.ts lib/jarvis-tools.ts app/api/jarvis/route.ts
git commit -m "feat: JARVIS money tools for accounts, net worth and balances"
```

---

## Task 18: Dashboard navigation link

**Files:**
- Modify: `app/(dashboard)/layout.tsx:14`

- [ ] **Step 1: Add the link**

In the `NAV` array, after the Health entry:

```ts
  { href: '/dashboard/money', label: 'Money', icon: '💰' },
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint app components lib`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/layout.tsx"
git commit -m "feat: money link in dashboard nav"
```

---

## Task 19: Full test run and deploy

- [ ] **Step 1: Run the whole suite**

Run: `npx jest`
Expected: all money tests pass. **`Navbar.test.tsx` still fails** — that is the pre-existing stale test described at the top of this plan, not a regression.

- [ ] **Step 2: Build**

Run: `npx next build`
Expected: build succeeds. If it fails on a route type, re-read `node_modules/next/dist/docs/` — `params` is a Promise in this version.

- [ ] **Step 3: Push**

```bash
gh auth switch --user mmsrashid
git push origin main
gh auth switch --user mmsrashid-profinity
```

---

## Task 20: Verify against the deployed site

Local dev cannot reach the database, so verification happens on the live site in the browser.

- [ ] **Step 1: Create an account and a balance through the UI**

Open `https://www.mmsrashid.com/dashboard/money/accounts`. Add an account, then add a balance. Confirm it appears in Overview and History.

- [ ] **Step 2: Verify the behaviours that the unit tests cannot cover**

Run in the browser console on any page of the site:

```js
const post = (u, b) => fetch(u, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(async r=>({s:r.status,j:await r.json()}));
// future-dated balance must be refused
const acc = (await fetch('/api/money/accounts').then(r=>r.json()))[0];
const future = new Date(Date.now()+864e5).toISOString().slice(0,10);
console.log('future date ->', await post('/api/money/balances', {account_id: acc.id, as_of: future, balance: 1}));
// same account + date twice must update, not duplicate
console.log('first  ->', await post('/api/money/balances', {account_id: acc.id, as_of: '2025-01-31', balance: 100}));
console.log('second ->', await post('/api/money/balances', {account_id: acc.id, as_of: '2025-01-31', balance: 200}));
console.log('rows on that date ->', (await fetch('/api/money/balances').then(r=>r.json())).filter(b=>b.as_of==='2025-01-31').length);
```

Expected: future date returns 400; the second POST returns 200 with balance 200; exactly **1** row on that date.

- [ ] **Step 3: Verify closing derives closed_date**

```js
const a = (await fetch('/api/money/accounts').then(r=>r.json()))[0];
const r = await fetch(`/api/money/accounts/${a.id}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'closed'})}).then(r=>r.json());
console.log(r.status, r.closed_date); // expect 'closed' and today's date, not null
```

- [ ] **Step 4: Verify JARVIS**

Ask, in the Money tab's sidebar: "What's my net worth?" Expect a figure with the accounts-counted caveat, and a `get_net_worth` tool call. Then ask "Set my Barclays Current balance to 1234 as of yesterday" and confirm it reports what it wrote.

- [ ] **Step 5: Clean up test data**

Delete any account and balances created purely for verification, so the user's real figures are not polluted.

- [ ] **Step 6: Commit any fixes found during verification**

---

## Deferred to later sub-projects

Do **not** build these now: transactions, spending categories, budgets, bills and subscriptions, holdings, portfolio performance, Open Banking API sync, multi-currency FX conversion. Sub-project 1 is complete when the success criteria in the spec are met.
