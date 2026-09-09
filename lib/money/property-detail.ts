import { buildPropertyPL, type Period, type PropertyPLRow } from './property-pl'
import { apportion, accruedInPeriod, isAccrued } from './accrual'
import type { MoneyProperty, PropertyTreatment } from './property-types'
import type { MoneyCategory, MoneyTransaction } from './spending-types'
import type { MoneyAccount } from './types'

type CategoryWithTreatment = MoneyCategory & { property_treatment?: PropertyTreatment | null }
type TransactionWithProperty = MoneyTransaction & {
  property_id?: string | null
  covers_from?: string | null
  covers_to?: string | null
}

/** A transaction as shown on a property's own page. */
export interface DetailLine {
  id: string
  date: string
  description: string
  /** Signed, and already adjusted for a part-owned property. */
  amount: number
  categoryId: string | null
  categoryName: string
  accountName: string
  /** The period this payment covers, when one has been recorded. */
  coversFrom: string | null
  coversTo: string | null
  /** How much of it falls in the period being viewed, once apportioned. */
  accrued: number
  /** True when it is spread over months other than the one it arrived in. */
  spread: boolean
  /** True when it was banked outside this period but accrues into it. */
  paidOutsidePeriod: boolean
}

export interface DetailGroup {
  treatment: PropertyTreatment | 'untreated'
  label: string
  /** Cash: what arrived or left inside the period. */
  total: number
  /**
   * Accruals: what belongs to the period. Differs from `total` only for rent
   * with a recorded covered period.
   */
  accruedTotal: number
  lines: DetailLine[]
}

export interface MonthRent {
  month: string
  /** Rent belonging to this month — apportioned where a period is recorded. */
  rent: number
  expenses: number
  cumulativeRent: number
  cumulativeExpenses: number
}

export interface PropertyDetail {
  property: MoneyProperty
  period: Period
  row: PropertyPLRow
  groups: DetailGroup[]
  /** Rent and expenses by month, with running totals. */
  byMonth: MonthRent[]
  /** True when any rent in view is spread across months. */
  hasAccruals: boolean
  currencyWarning: string | null
}

const GROUP_ORDER: (PropertyTreatment | 'untreated')[] = [
  'rental_income', 'allowable', 'interest', 'capital', 'non_allowable', 'untreated',
]

const GROUP_LABEL: Record<PropertyTreatment | 'untreated', string> = {
  rental_income: 'Rent received',
  allowable: 'Allowable expenses',
  interest: 'Mortgage interest',
  capital: 'Capital spend',
  non_allowable: 'Not allowable',
  untreated: 'Tagged but unclassified',
}

/**
 * Running totals alongside the monthly figures.
 *
 * Rent is not always monthly — three and six months in advance both happen —
 * so a month-by-month net is misleading on its own: five rent-free months
 * followed by one large payment looks like arrears when it is an advance. The
 * cumulative columns are the ones that tell you whether rent is keeping up with
 * the mortgage.
 */
function withRunningTotals(months: MonthRent[]): MonthRent[] {
  let rent = 0
  let expenses = 0
  return months.map(m => {
    rent += m.rent
    expenses += m.expenses
    return { ...m, cumulativeRent: rent, cumulativeExpenses: expenses }
  })
}

/**
 * One property's P&L with the transactions behind every figure.
 *
 * The row totals come from buildPropertyPL over a single-property list rather
 * than being recomputed here. Section 24 makes cash profit and taxable profit
 * differ, and a second implementation of that would eventually disagree with
 * the portfolio table about the same property — so there is only ever one.
 *
 * Amounts are scaled by share_percent, matching the totals. A half-owned flat
 * reports half of each line, so the lines add up to the figure above them.
 *
 * Rent is shown on both bases. Cash is what arrived; accrued is what belongs to
 * the period once an advance is spread over the months it covers. A payment
 * banked outside the period but accruing into it is still listed — otherwise
 * the accrued total could not be explained by the lines beneath it.
 */
export function buildPropertyDetail(
  property: MoneyProperty,
  transactions: TransactionWithProperty[],
  categories: CategoryWithTreatment[],
  accounts: MoneyAccount[],
  period: Period,
): PropertyDetail {
  const pl = buildPropertyPL([property], transactions, categories, accounts, period)
  const row = pl.perProperty[0]

  const catById = new Map(categories.map(c => [c.id, c]))
  const acctById = new Map(accounts.map(a => [a.id, a]))
  const share = (property.share_percent ?? 100) / 100

  const treatmentOf = (t: TransactionWithProperty): PropertyTreatment | 'untreated' => {
    const cat = t.category_id ? catById.get(t.category_id) : undefined
    return cat?.property_treatment ?? 'untreated'
  }

  const owned = transactions
    .filter(t => t.property_id === property.id)
    .filter(t => !property.disposed_date || t.txn_date <= property.disposed_date)

  const inPeriod = (t: TransactionWithProperty) =>
    t.txn_date >= period.from && t.txn_date <= period.to

  const mine = owned
    .filter(t => {
      if (inPeriod(t)) return true
      // Banked elsewhere but accruing into this period: it has to be visible,
      // because it is part of the accrued total shown above the list.
      return treatmentOf(t) === 'rental_income'
        && Number(t.amount) > 0
        && accruedInPeriod(t, period) !== 0
    })
    .sort((a, b) => b.txn_date.localeCompare(a.txn_date)
      || a.description.localeCompare(b.description))

  const buckets = new Map<PropertyTreatment | 'untreated', DetailLine[]>()
  const monthly = new Map<string, MonthRent>()
  let hasAccruals = false

  const month = (key: string): MonthRent => {
    const m = monthly.get(key)
      ?? { month: key, rent: 0, expenses: 0, cumulativeRent: 0, cumulativeExpenses: 0 }
    monthly.set(key, m)
    return m
  }

  for (const t of mine) {
    const cat = t.category_id ? catById.get(t.category_id) : undefined
    const treatment = treatmentOf(t)
    const amount = Number(t.amount) * share
    const isRent = treatment === 'rental_income' && amount > 0
    const spread = isRent && isAccrued(t)
    if (spread) hasAccruals = true

    const line: DetailLine = {
      id: t.id,
      date: t.txn_date,
      description: t.description.replace(/\s+/g, ' ').trim(),
      amount,
      categoryId: t.category_id ?? null,
      categoryName: cat?.name ?? (t.category_id ? 'Unknown category' : 'Uncategorised'),
      accountName: acctById.get(t.account_id)?.name ?? '—',
      coversFrom: t.covers_from ?? null,
      coversTo: t.covers_to ?? null,
      accrued: isRent ? accruedInPeriod(t, period) * share : (inPeriod(t) ? amount : 0),
      spread,
      paidOutsidePeriod: !inPeriod(t),
    }

    const list = buckets.get(treatment) ?? []
    list.push(line)
    buckets.set(treatment, list)

    if (isRent) {
      // Apportioned into the months it covers, so a six-month advance shows as
      // rent in each of those months rather than one spike and five blanks.
      for (const s of apportion(t)) {
        if (s.effectiveDate < period.from || s.effectiveDate > period.to) continue
        month(s.month).rent += s.amount * share
      }
      continue
    }

    if (!inPeriod(t)) continue
    // A refund to the tenant is an expense, not negative rent: netting it off
    // would hide both the rent and the refund.
    month(t.txn_date.slice(0, 7)).expenses += Math.abs(amount)
  }

  const round = (n: number) => Math.round(n * 100) / 100

  const groups: DetailGroup[] = GROUP_ORDER
    .filter(g => (buckets.get(g)?.length ?? 0) > 0)
    .map(g => {
      const lines = buckets.get(g)!
      const cash = g === 'rental_income'
        ? lines.reduce((s, l) => s + (l.amount > 0 && !l.paidOutsidePeriod ? l.amount : 0), 0)
        : lines.reduce((s, l) => s + Math.abs(l.amount), 0)
      const accrued = lines.reduce((s, l) => s + Math.abs(l.accrued), 0)
      return {
        treatment: g,
        label: GROUP_LABEL[g],
        total: round(cash),
        accruedTotal: round(accrued),
        lines,
      }
    })

  return {
    property,
    period,
    row,
    groups,
    byMonth: withRunningTotals(
      [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
    ),
    hasAccruals,
    currencyWarning: pl.currencyWarning,
  }
}
