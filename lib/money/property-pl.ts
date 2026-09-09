import type { MoneyProperty, PropertyTreatment } from './property-types'
import type { MoneyCategory, MoneyTransaction } from './spending-types'
import type { MoneyAccount } from './types'

/** A category row carrying its property treatment, once migration 015 has run. */
type CategoryWithTreatment = MoneyCategory & { property_treatment?: PropertyTreatment | null }
/** A transaction row carrying its property tag, once migration 015 has run. */
type TransactionWithProperty = MoneyTransaction & { property_id?: string | null }

export interface Period { from: string; to: string }

export interface PropertyPLRow {
  propertyId: string
  code: string
  label: string | null
  sharePercent: number
  rentReceived: number
  allowableExpenses: number
  mortgageInterest: number
  capitalSpend: number
  otherNonAllowable: number
  /** Rent − allowable − interest − other. What actually hit the bank. */
  cashProfit: number
  /** Rent − allowable. Interest excluded: Section 24. */
  taxableProfit: number
  /** 20% of the lower of interest and taxable profit. */
  interestTaxReducer: number
  /** True when the reducer was limited by profit rather than by interest. */
  reducerCapped: boolean
  /** Tagged to this property but the category has no property treatment set. */
  unclassifiedCount: number
  unclassifiedValue: number
}

export interface PropertyPL {
  period: Period
  perProperty: PropertyPLRow[]
  totals: Omit<PropertyPLRow, 'propertyId' | 'code' | 'label' | 'sharePercent' | 'reducerCapped'>
  /** Property-looking transactions with no property tag at all. */
  untaggedCount: number
  untaggedValue: number
  currencyWarning: string | null
}

/**
 * UK tax year bounds. Runs 6 April to 5 April — a calendar-year filter would
 * misfile every early-April transaction and quietly misstate the year.
 *
 * Accepts "2026/27" or "2026".
 */
export function taxYearBounds(taxYear: string): Period {
  const start = Number(taxYear.slice(0, 4))
  return { from: `${start}-04-06`, to: `${start + 1}-04-05` }
}

const pence = (n: number) => Math.round(n * 100)

/** Basic rate, used for the Section 24 finance-cost reducer. */
const REDUCER_RATE = 0.2

/**
 * Per-property profit for a period, as both cash and taxable figures.
 *
 * These differ, and the difference is the point. For a personally-held property,
 * mortgage interest is a real cash cost but is NOT deductible against rental
 * income — it instead attracts a 20% tax reducer. Reporting one figure would be
 * confidently wrong for whichever purpose the reader actually had.
 *
 * This is arithmetic, not tax advice. It deliberately does not compute a tax
 * liability: that depends on total income, other reliefs and a marginal rate this
 * function cannot know.
 */
export function buildPropertyPL(
  properties: MoneyProperty[],
  transactions: TransactionWithProperty[],
  categories: CategoryWithTreatment[],
  accounts: MoneyAccount[],
  period: Period,
): PropertyPL {
  const treatmentOf = new Map(
    categories.map(c => [c.id, c.property_treatment ?? null] as const),
  )

  const inPeriod = transactions.filter(
    t => t.txn_date >= period.from && t.txn_date <= period.to,
  )

  // Same guard as net worth and spending: a total spanning currencies would be
  // confidently wrong, and FX conversion is out of scope.
  const used = new Set(inPeriod.map(t => t.account_id))
  const currencies = [...new Set(
    accounts.filter(a => used.has(a.id)).map(a => a.currency),
  )].sort()
  const currencyWarning = currencies.length > 1
    ? `These transactions span ${currencies.join(', ')}. A property P&L needs a single currency.`
    : null

  const perProperty: PropertyPLRow[] = properties.map(p => {
    const share = Number(p.share_percent) / 100

    // A property stops contributing after it is sold, but keeps everything
    // before — the same carried-forward-window rule as closed accounts and
    // ended medicines.
    const rows = inPeriod.filter(t =>
      t.property_id === p.id && (!p.disposed_date || t.txn_date <= p.disposed_date))

    let rentP = 0, allowP = 0, interestP = 0, capitalP = 0, otherP = 0
    let unclassifiedCount = 0, unclassifiedP = 0

    for (const t of rows) {
      const amount = pence(Number(t.amount))
      const treatment = t.category_id ? treatmentOf.get(t.category_id) ?? null : null

      if (!treatment) {
        // Surfaced, never silently dropped: a P&L missing half its expenses
        // looks like a very profitable portfolio.
        unclassifiedCount++
        unclassifiedP += Math.abs(amount)
        continue
      }

      if (treatment === 'rental_income') rentP += amount > 0 ? amount : 0
      else if (treatment === 'allowable') allowP += Math.abs(amount)
      else if (treatment === 'interest') interestP += Math.abs(amount)
      else if (treatment === 'capital') capitalP += Math.abs(amount)
      else otherP += Math.abs(amount)
    }

    // Share applies to every figure, not just the profit, so a jointly held
    // property reports the owner's portion throughout.
    const sh = (p: number) => Math.round(p * share)

    const rent = sh(rentP)
    const allow = sh(allowP)
    const interest = sh(interestP)
    const capital = sh(capitalP)
    const other = sh(otherP)

    const cashP = rent - allow - interest - other
    const taxableP = rent - allow

    // Relief is limited to 20% of the lower of finance costs and property
    // profits. An uncapped 20% of interest would overstate it in a lean year.
    // The statutory test has a third limb — adjusted total income — which this
    // function cannot see, so the figure is an upper bound on that basis.
    const reliefBaseP = Math.max(Math.min(interest, Math.max(taxableP, 0)), 0)
    const reducerP = Math.round(reliefBaseP * REDUCER_RATE)

    return {
      propertyId: p.id,
      code: p.code,
      label: p.label,
      sharePercent: Number(p.share_percent),
      rentReceived: rent / 100,
      allowableExpenses: allow / 100,
      mortgageInterest: interest / 100,
      capitalSpend: capital / 100,
      otherNonAllowable: other / 100,
      cashProfit: cashP / 100,
      taxableProfit: taxableP / 100,
      interestTaxReducer: reducerP / 100,
      reducerCapped: interest > 0 && reliefBaseP < interest,
      unclassifiedCount,
      unclassifiedValue: sh(unclassifiedP) / 100,
    }
  })

  const sum = (pick: (r: PropertyPLRow) => number) =>
    Math.round(perProperty.reduce((acc, r) => acc + pence(pick(r)), 0)) / 100

  const propertyIds = new Set(properties.map(p => p.id))
  const untagged = inPeriod.filter(t => {
    if (t.property_id && propertyIds.has(t.property_id)) return false
    // Only count transactions whose category is a property one; ordinary
    // spending is not "missing a property tag".
    const treatment = t.category_id ? treatmentOf.get(t.category_id) ?? null : null
    return treatment !== null
  })

  return {
    period,
    perProperty,
    totals: {
      rentReceived: sum(r => r.rentReceived),
      allowableExpenses: sum(r => r.allowableExpenses),
      mortgageInterest: sum(r => r.mortgageInterest),
      capitalSpend: sum(r => r.capitalSpend),
      otherNonAllowable: sum(r => r.otherNonAllowable),
      cashProfit: sum(r => r.cashProfit),
      taxableProfit: sum(r => r.taxableProfit),
      interestTaxReducer: sum(r => r.interestTaxReducer),
      unclassifiedCount: perProperty.reduce((a, r) => a + r.unclassifiedCount, 0),
      unclassifiedValue: sum(r => r.unclassifiedValue),
    },
    untaggedCount: untagged.length,
    untaggedValue: Math.round(untagged.reduce((a, t) => a + Math.abs(pence(Number(t.amount))), 0)) / 100,
    currencyWarning,
  }
}

/**
 * The most recent tax year that has any property-tagged activity.
 *
 * The year selector defaulted to the current tax year, which showed a table of
 * zeros whenever the latest statement was from an earlier year — a working
 * portfolio reading as an empty one. Returns null when nothing is tagged yet,
 * in which case the caller should keep its own default.
 */
export function latestTaxYearWithActivity(
  transactions: { txn_date: string; property_id?: string | null }[],
): string | null {
  let best: string | null = null
  for (const t of transactions) {
    if (!t.property_id) continue
    const [y, m] = t.txn_date.split('-').map(Number)
    // The year turns on 6 April, so 1 January to 5 April belong to the year
    // that started the previous April.
    const startYear = m > 4 || (m === 4 && Number(t.txn_date.slice(8, 10)) >= 6) ? y : y - 1
    const year = `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`
    if (best === null || year > best) best = year
  }
  return best
}
