# Money: Job & Payslips — Design

**Status:** approved 3 Aug 2026
**Sub-project:** 6 of the Money module

## Context

The user wants a **Job** tab covering employment income and payslips: salary, payslip breakdowns, tax
and NI deducted, pension contributions, bonuses.

This is the income side of the Money module, complementing spending. It sits naturally alongside
Property P&L: together they account for where income comes from, while Spending accounts for where it
goes.

Out of scope: job applications and pipeline, contract and benefits records, time tracking. Those were
offered and not chosen.

## Goal

Record payslips, show earnings and deductions over time, and reconcile net pay against what actually
arrived in the bank.

## Schema — `supabase/migrations/016_job.sql`

### `job_employments`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid not null | → `auth.users(id)` on delete cascade |
| `employer` | text not null | |
| `role` | text | |
| `started_on` | date | |
| `ended_on` | date | |
| `status` | text not null default `'current'` | check in (`current`, `former`) |
| `payroll_ref` | text | employee number, useful for matching payslips |
| `notes` | text | |
| `created_at` | timestamptz not null default now() | |

More than one employment can exist, and they can overlap — a second job, or a handover month. Nothing
assumes a single employer.

### `job_payslips`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid not null | → `auth.users(id)` on delete cascade |
| `employment_id` | uuid | → `job_employments(id)` on delete set null |
| `pay_date` | date not null | when it was paid, not the period end |
| `period_label` | text | e.g. "Month 4" or "Jul 2026", as printed |
| `gross` | numeric(12,2) not null | |
| `income_tax` | numeric(12,2) not null default 0 | |
| `national_insurance` | numeric(12,2) not null default 0 | |
| `pension_employee` | numeric(12,2) not null default 0 | |
| `pension_employer` | numeric(12,2) not null default 0 | not part of net pay |
| `student_loan` | numeric(12,2) not null default 0 | |
| `other_deductions` | numeric(12,2) not null default 0 | |
| `bonus` | numeric(12,2) not null default 0 | part of gross, tracked separately |
| `net` | numeric(12,2) not null | as printed on the payslip |
| `tax_code` | text | |
| `document_id` | uuid | → `money_documents(id)` on delete set null |
| `notes` | text | |
| `created_at` | timestamptz not null default now() | |

Constraint: `unique (user_id, employment_id, pay_date)` — one payslip per employer per pay date, so
re-uploading the same payslip updates rather than duplicating.

Indexes: `(user_id, pay_date desc)`.

All amounts are `numeric`, never float, and all are stored as **positive magnitudes** — a deduction is
positive in its own column. Mixing signs across deduction columns is how a total ends up added
instead of subtracted.

`pension_employer` is deliberately separate and excluded from net-pay arithmetic: it is money paid on
the user's behalf, not deducted from them. Including it in either gross-to-net or in "income" would
be wrong in opposite directions.

RLS on both tables, policy `for all using (auth.uid() = user_id) with check (auth.uid() = user_id)`.

## Derivation

A pure function in `lib/money/payslip-summary.ts`:

```ts
buildPayslipSummary(payslips, taxYear) → {
  periods: Array<{
    payDate, periodLabel, gross, bonus,
    incomeTax, nationalInsurance, pensionEmployee, studentLoan, otherDeductions,
    net,
    computedNet,        // gross − the five deductions
    netMismatch,        // net − computedNet; non-zero means something is unrecorded
    effectiveTaxRate,   // (incomeTax + NI) / gross
  }>,
  totals: { gross, bonus, incomeTax, nationalInsurance, pensionEmployee, pensionEmployer, net },
  taxYear: string,
  mismatchCount: number,
}
```

Two rules worth stating:

1. **`computedNet` is derived and compared against the printed `net`.** A payslip has more possible
   deduction lines than any fixed schema can hold — salary sacrifice, season ticket loans, childcare,
   attachment of earnings. If gross minus the recorded deductions does not equal the printed net,
   something exists that was not captured. Surfacing that gap is the difference between a record that
   is trustworthy and one that merely looks tidy. `other_deductions` is where the user can absorb it
   once identified.
2. **Tax years run 6 April to 5 April.** A calendar-year filter would put an April payslip in the
   wrong year and quietly misstate an annual total. The boundary is explicit in the function, not left
   to a `slice(0, 4)` on the date.

## Reconciliation against the bank

Net pay should appear as a credit in a `money_transactions` row. `lib/money/payslip-reconcile.ts`
matches each payslip to a transaction within a few days of `pay_date` whose amount equals `net`, and
reports:

- matched
- payslip with no matching credit — either the transaction is not imported, or the pay did not arrive
- salary-looking credit with no payslip — a payslip is missing from the record

Same philosophy as the balance reconciliation: it warns, and never invents or edits either side.

## Payslip extraction

`lib/money/extract-payslip.ts`, a Claude tool-schema extractor over a payslip PDF or photo, returning
the fields above plus a confidence flag.

Specific instructions it needs, because payslips are dense and easy to misread:

- Take **this period's** figures, not the year-to-date column. Payslips print both side by side, and
  taking YTD would overstate a month by an order of magnitude — the single most likely failure.
- Employer pension contribution is separate from the employee's, and is not a deduction from pay.
- Record deductions as positive magnitudes.
- Return the printed net exactly, even if it disagrees with the arithmetic; the mismatch is
  information, and silently correcting it would destroy the signal.
- Mark low confidence rather than guessing at a smudged or cropped figure.

Low-confidence payslips go to review rather than being filed, consistent with the balance and
transaction ingest.

## API

| Route | Methods |
|---|---|
| `/api/money/employments` | GET, POST |
| `/api/money/employments/[id]` | PATCH, DELETE |
| `/api/money/payslips` | GET, POST (upsert on employer + pay date) |
| `/api/money/payslips/[id]` | PATCH, DELETE |
| `/api/money/payslips/ingest` | POST — payslip PDF or image |

`PATCH /api/money/employments/[id]` derives `ended_on` when `status` flips to `former`, and clears it
on reactivation — the same derivation as `closed_date`, `disposed_date` and `end_date` elsewhere.

Validation: reject a negative amount in any deduction column; reject a `pay_date` more than one day in
the future; reject a `gross` of zero.

## UI

A **Job** tab in the Money shell:

- Tax-year selector using 6 April boundaries.
- Headline: gross, take-home, income tax, NI, pension for the year to date, with effective tax rate.
- A payslip table by pay date, with a warning marker on any row where printed net and computed net
  disagree, stating the gap.
- A reconciliation note listing payslips with no matching bank credit and salary credits with no
  payslip.
- Employment records with the ability to add a second or former employer.

Components: `components/money/PayslipTable.tsx`, `components/money/EarningsTrend.tsx` (hand-rolled
SVG, consistent with the other charts).

## JARVIS tools

`get_payslips` (tax year or range), `get_earnings_summary` (year totals and effective rate),
`add_payslip`.

`get_earnings_summary` must report the mismatch count alongside any total, for the same reason
`get_spending_summary` reports uncategorised: a total drawn from incomplete payslips must not read as
authoritative. JARVIS is not a tax adviser and must not compute liabilities or advise on tax codes.

## Privacy

Payslips are among the most sensitive documents here — they carry salary, National Insurance
information and employer detail. RLS scopes every row to its owner, payslip files live in the private
`money-documents` bucket behind signed URLs, and no amount or tax code is ever written to a log or an
error message.

## Tests

- `payslip-summary.ts`: computedNet vs printed net mismatch detected and counted; a 5 April and a
  6 April payslip fall in different tax years; employer pension excluded from net arithmetic but
  included in its own total; effective rate zero-safe on a zero gross; empty year returns zeros not
  NaN; deductions summed in pence without drift.
- `payslip-reconcile.ts`: exact net matched within the window; payslip with no credit reported; credit
  with no payslip reported; a near-miss amount not matched.

## Success criteria

1. A payslip PDF can be uploaded and filed, with low-confidence ones held for review.
2. The Job tab shows gross, deductions and take-home for a tax year using 6 April boundaries.
3. A payslip whose deductions do not explain its net pay is flagged with the gap.
4. Employer pension is tracked but never treated as a deduction from pay.
5. Net pay is reconciled against bank credits, warning both ways.
6. Re-uploading the same payslip updates rather than duplicating it.
7. Nothing presents a figure as tax advice.
