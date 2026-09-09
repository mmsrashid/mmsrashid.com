import { buildPropertyPL, type Period, type PropertyPLRow } from './property-pl'
import type { MoneyProperty, PropertyTreatment } from './property-types'
import type { MoneyCategory, MoneyTransaction } from './spending-types'
import type { MoneyAccount } from './types'

type CategoryWithTreatment = MoneyCategory & { property_treatment?: PropertyTreatment | null }
type TransactionWithProperty = MoneyTransaction & { property_id?: string | null }

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
}

export interface DetailGroup {
  treatment: PropertyTreatment | 'untreated'
  label: string
  /** Positive for income, positive for expense magnitudes. */
  total: number
  lines: DetailLine[]
}

export interface MonthRent {
  month: string
  rent: number
  expenses: number
}

export interface PropertyDetail {
  property: MoneyProperty
  period: Period
  row: PropertyPLRow
  groups: DetailGroup[]
  /** Rent and expenses by month, to make a missing month visible. */
  byMonth: MonthRent[]
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
 * One property's P&L with the transactions behind every figure.
 *
 * The totals come from buildPropertyPL over a single-property list rather than
 * being recomputed here. Section 24 makes cash profit and taxable profit differ,
 * and a second implementation of that would eventually disagree with the
 * portfolio table about the same property — so there is only ever one.
 *
 * Amounts are scaled by share_percent, matching the totals. A half-owned flat
 * reports half of each line, so the lines add up to the figure above them.
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

  const mine = transactions
    .filter(t => t.property_id === property.id)
    .filter(t => t.txn_date >= period.from && t.txn_date <= period.to)
    .filter(t => !property.disposed_date || t.txn_date <= property.disposed_date)
    .sort((a, b) => b.txn_date.localeCompare(a.txn_date) || a.description.localeCompare(b.description))

  const buckets = new Map<PropertyTreatment | 'untreated', DetailLine[]>()
  const monthly = new Map<string, MonthRent>()

  for (const t of mine) {
    const cat = t.category_id ? catById.get(t.category_id) : undefined
    const treatment: PropertyTreatment | 'untreated' = cat?.property_treatment ?? 'untreated'
    const amount = Number(t.amount) * share

    const line: DetailLine = {
      id: t.id,
      date: t.txn_date,
      description: t.description.replace(/\s+/g, ' ').trim(),
      amount,
      categoryId: t.category_id ?? null,
      categoryName: cat?.name ?? (t.category_id ? 'Unknown category' : 'Uncategorised'),
      accountName: acctById.get(t.account_id)?.name ?? '—',
    }

    const list = buckets.get(treatment) ?? []
    list.push(line)
    buckets.set(treatment, list)

    const key = t.txn_date.slice(0, 7)
    const m = monthly.get(key) ?? { month: key, rent: 0, expenses: 0 }
    if (treatment === 'rental_income') {
      // Only money in counts as rent. A refund to the tenant sits in expenses,
      // where it belongs, rather than reducing the rent figure invisibly.
      if (amount > 0) m.rent += amount
      else m.expenses += Math.abs(amount)
    } else {
      m.expenses += Math.abs(amount)
    }
    monthly.set(key, m)
  }

  const groups: DetailGroup[] = GROUP_ORDER
    .filter(g => (buckets.get(g)?.length ?? 0) > 0)
    .map(g => {
      const lines = buckets.get(g)!
      const total = g === 'rental_income'
        ? lines.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0)
        : lines.reduce((s, l) => s + Math.abs(l.amount), 0)
      return { treatment: g, label: GROUP_LABEL[g], total, lines }
    })

  return {
    property,
    period,
    row,
    groups,
    byMonth: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
    currencyWarning: pl.currencyWarning,
  }
}
