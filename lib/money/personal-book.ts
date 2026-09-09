import { buildSpendingSummary, type SpendingSummary } from './spending-summary'
import { taxYearBounds, type Period } from './property-pl'
import type { MoneyCategory, MoneyTransaction } from './spending-types'
import type { PropertyTreatment } from './property-types'
import type { MoneyAccount } from './types'

type CategoryWithTreatment = MoneyCategory & { property_treatment?: PropertyTreatment | null }
type TransactionWithProperty = MoneyTransaction & { property_id?: string | null }

/**
 * The personal book and the property book are separate sets of accounts that
 * happen to share bank accounts. This module owns the boundary between them.
 *
 * A transaction belongs to the property book when the user has tagged it to a
 * property. Nothing else decides it: the tag is a deliberate act, and the user
 * is the one who knows whether a payment was for a flat or for themselves.
 *
 * A transaction carrying a property CATEGORY but no tag belongs to neither
 * book. It is a half-finished decision — "this is a property expense" without
 * "which property" — so counting it as personal would drop thousands of pounds
 * of rent and mortgage interest into the personal P&L, and counting it as
 * property would attribute it to nothing. It is held for review instead, which
 * the Property tab already reports.
 */
export function isPersonalRow(
  txn: TransactionWithProperty,
  treatmentOf: ReadonlyMap<string, PropertyTreatment | null>,
): boolean {
  if (txn.property_id) return false
  const treatment = txn.category_id ? treatmentOf.get(txn.category_id) ?? null : null
  return treatment === null
}

export function treatmentMap(
  categories: CategoryWithTreatment[],
): Map<string, PropertyTreatment | null> {
  return new Map(categories.map(c => [c.id, c.property_treatment ?? null] as const))
}

/** The UK tax year containing a YYYY-MM month, as "2025/26". */
export function taxYearOf(month: string): string {
  const [y, m] = month.split('-').map(Number)
  // The year turns on 6 April, so January to March belong to the year before.
  const start = m >= 4 ? y : y - 1
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`
}

export interface PersonalPL {
  month: SpendingSummary
  /** Same shape, accumulated from 6 April of the tax year containing `month`. */
  yearToDate: SpendingSummary
  taxYear: string
  taxYearPeriod: Period
  /** Rows held for review: a property category with no property tag. */
  heldForReviewCount: number
  heldForReviewValue: number
  /** Rows excluded because they belong to the property book. */
  propertyRowCount: number
}

/**
 * Builds the personal P&L for one month, plus the tax year to date.
 *
 * Aggregation is delegated to buildSpendingSummary so there is exactly one
 * implementation of "what does a month add up to"; this function's job is only
 * to decide which rows are personal in the first place.
 *
 * @param month YYYY-MM
 */
export function buildPersonalPL(
  transactions: TransactionWithProperty[],
  categories: CategoryWithTreatment[],
  accounts: MoneyAccount[],
  month: string,
): PersonalPL {
  const treatmentOf = treatmentMap(categories)

  const personal = transactions.filter(t => isPersonalRow(t, treatmentOf))
  const propertyRows = transactions.filter(t => t.property_id)
  const held = transactions.filter(t => {
    if (t.property_id) return false
    const treatment = t.category_id ? treatmentOf.get(t.category_id) ?? null : null
    return treatment !== null
  })

  const taxYear = taxYearOf(month)
  const bounds = taxYearBounds(taxYear)
  // "To date" means to the end of the month being viewed, not to today: looking
  // at an earlier month should show the year as it stood then, not a total that
  // includes everything after it.
  //
  // -31 as the upper bound is deliberate. It is a string comparison, so
  // "2025-02-31" correctly admits every February date without needing to know
  // how long the month is.
  const monthEnd = `${month}-31`
  const to = monthEnd < bounds.to ? monthEnd : bounds.to

  return {
    month: buildSpendingSummary(personal, categories, accounts, month),
    yearToDate: buildSpendingSummary(
      personal, categories, accounts, month, { from: bounds.from, to },
    ),
    taxYear,
    taxYearPeriod: { from: bounds.from, to },
    heldForReviewCount: held.length,
    heldForReviewValue: held.reduce((s, t) => s + Number(t.amount), 0),
    propertyRowCount: propertyRows.length,
  }
}
