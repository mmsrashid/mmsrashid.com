import type { MoneyCategory, MoneyTransaction } from './spending-types'
import type { MoneyProperty } from './property-types'
import type { MoneyAccount } from './types'

export type SortKey = 'date' | 'description' | 'account' | 'amount' | 'category' | 'property'
export type SortDir = 'asc' | 'desc'
export interface Sort { key: SortKey; dir: SortDir }

/** Biggest-first is the useful default for dates and amounts; names read A-Z. */
export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  date: 'desc', amount: 'desc',
  description: 'asc', account: 'asc', category: 'asc', property: 'asc',
}

/** Clicking the sorted column flips it; clicking another starts at its default. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key !== key) return { key, dir: DEFAULT_DIR[key] }
  return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
}

export interface Lookups {
  accounts: Pick<MoneyAccount, 'id' | 'name'>[]
  categories: Pick<MoneyCategory, 'id' | 'name'>[]
  properties: Pick<MoneyProperty, 'id' | 'code'>[]
}

type Sortable = MoneyTransaction & { property_id?: string | null }

/**
 * Orders transactions for the table.
 *
 * Sorts on the DISPLAYED value, not the stored id: sorting by "Account" has to
 * mean alphabetical by account name. Sorting by uuid would look arbitrary while
 * appearing to work, which is worse than not sorting at all.
 *
 * Pure and total — never mutates its input, and every key produces a complete
 * order, so the table cannot end up in a state where rows shuffle on re-render.
 */
export function sortTransactions<T extends Sortable>(
  transactions: readonly T[], sort: Sort, lookups: Lookups,
): T[] {
  const accName = new Map(lookups.accounts.map(a => [a.id, a.name]))
  const catName = new Map(lookups.categories.map(c => [c.id, c.name]))
  const propCode = new Map(lookups.properties.map(p => [p.id, p.code]))

  const text = (t: T, key: SortKey): string => {
    switch (key) {
      case 'description': return t.description
      case 'account': return accName.get(t.account_id) ?? ''
      case 'category': return t.category_id ? catName.get(t.category_id) ?? '' : ''
      case 'property': return t.property_id ? propCode.get(t.property_id) ?? '' : ''
      default: return t.txn_date
    }
  }

  const dir = sort.dir === 'asc' ? 1 : -1

  return [...transactions].sort((a, b) => {
    if (sort.key === 'amount') {
      const d = Number(a.amount) - Number(b.amount)
      if (d !== 0) return d * dir
    } else {
      const [x, y] = [text(a, sort.key), text(b, sort.key)]
      // Blanks sort last whichever way the column points. An uncategorised row
      // is missing information, not information that sorts before "Bills" —
      // burying the blanks under a Z-A sort would hide the rows most in need of
      // attention, which is the main reason to sort by that column at all.
      if (!x !== !y) return x ? -1 : 1
      const c = x.localeCompare(y, 'en-GB', { sensitivity: 'base', numeric: true })
      if (c !== 0) return c * dir
    }
    // Ties break on date, newest first, regardless of direction: it keeps the
    // order stable and readable in columns like Account where hundreds of rows
    // share one value.
    return b.txn_date.localeCompare(a.txn_date)
  })
}
