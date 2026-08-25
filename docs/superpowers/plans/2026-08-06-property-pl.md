# Property P&L Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Per-property rent, expenses, cash profit and taxable profit for four personally-held tenanted properties.

**Architecture:** Rent and property costs are existing `money_transactions` tagged with `property_id` — no parallel data model. All derivation in a pure `lib/money/property-pl.ts`. One new tab in the Money shell.

**Spec:** `docs/superpowers/specs/2026-08-03-property-pl-design.md`

**Note on plan depth:** written for immediate same-session execution against a detailed spec, so it is proportionate rather than exhaustive. Codebase gotchas are in the sub-project 2 plan (`2026-08-03-money-transactions-spending.md`) — read its preamble first: no `test` script (`npx jest`), migrations applied by hand via the Supabase SQL editor in "Personal Chrome", PostgREST 1000-row cap, local-vs-UTC dates, push protocol.

---

## Task 1: Migration 015

- [ ] `money_properties` (code, label, ownership, share_percent, acquired/disposed, status)
- [ ] `money_transactions.property_id` (on delete set null)
- [ ] `money_categories.property_treatment` check in (rental_income, allowable, interest, capital, non_allowable)
- [ ] `money_category_rules.property_id` (on delete cascade)
- [ ] RLS `for all` on the new table
- [ ] Apply via SQL editor; expect "Success. No rows returned"
- [ ] Commit

## Task 2: Types — `lib/money/property-types.ts`

- [ ] `PROPERTY_TREATMENTS`, `OWNERSHIP_KINDS`, `MoneyProperty`, `PROPERTY_CATEGORY_SEED`
- [ ] Typecheck, commit

## Task 3: P&L derivation — `lib/money/property-pl.ts` (+ tests)

The correctness-critical task. Section 24: interest is a cash expense but NOT deductible.

- [ ] Tests first, covering: interest excluded from taxable but included in cash; share_percent applied to every figure; disposed property excluded after disposal, retained before; reducer capped at 20% of taxable profit; reducer zero in a loss; capital spend excluded from both profits but reported; untagged counted; mixed currency warning; empty period returns zeros not NaN; pence-level no drift
- [ ] Implement `buildPropertyPL(properties, transactions, categories, from, to)`
- [ ] Verify tests pass, commit

## Task 4: API

- [ ] `/api/money/properties` GET (seeds nothing), POST
- [ ] `/api/money/properties/[id]` PATCH (derives `disposed_date` on status flip), DELETE
- [ ] Extend `/api/money/transactions/[id]` PATCH to accept `property_id`
- [ ] Extend `/api/money/categories` POST/PATCH to accept `property_treatment`
- [ ] Typecheck, commit

## Task 5: UI

- [ ] `components/money/PropertyPLTable.tsx` — per-property rows, portfolio total, reducer as its own line, not-tax-advice note
- [ ] `app/(dashboard)/dashboard/money/property/page.tsx` — tax-year selector on 6 April boundaries, untagged banner
- [ ] Add "Property" tab to `MoneyShell`
- [ ] Typecheck, commit

## Task 6: JARVIS

- [ ] `get_property_pl` — returns cash AND taxable both labelled, plus untagged count; never one as "the" profit
- [ ] `tag_transaction_property`
- [ ] Extend the Money system-prompt paragraph: not a tax adviser
- [ ] Typecheck, commit

## Task 7: Build, deploy, verify live

- [ ] `npx jest` — money tests pass (Navbar failure is pre-existing)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ.dummy.sig" npx next build`
- [ ] Push (auth switch protocol)
- [ ] Live: create the four properties, tag transactions by rule, confirm interest excluded from taxable, confirm reducer cap, confirm untagged surfaced
- [ ] Delete test data, keep the four real properties if the user wants them
