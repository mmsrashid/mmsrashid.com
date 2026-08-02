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
  // An unknown or missing category is treated as spending, never silently
  // dropped: a transaction absent from the totals is worse than a miscategorised
  // one, because nothing hints that it is missing.
  const kindOf = (t: MoneyTransaction) =>
    t.category_id ? byId.get(t.category_id)?.kind ?? 'spending' : 'spending'

  let outP = 0
  let inP = 0
  let uncatCount = 0
  let uncatP = 0
  const catTotals = new Map<string | null, number>()

  for (const t of inMonth) {
    if (kindOf(t) === 'transfer') continue

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
