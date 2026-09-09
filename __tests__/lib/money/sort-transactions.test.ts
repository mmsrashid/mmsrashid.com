import {
  sortTransactions, nextSort, DEFAULT_DIR,
  type Sort, type Lookups,
} from '@/lib/money/sort-transactions'
import type { MoneyTransaction } from '@/lib/money/spending-types'

const lookups: Lookups = {
  accounts: [
    { id: 'acc-s', name: 'Starling Current' },
    { id: 'acc-b', name: 'Barclays' },
  ],
  categories: [
    { id: 'cat-g', name: 'Groceries' },
    { id: 'cat-u', name: 'Utilities' },
  ],
  properties: [
    { id: 'p-4', code: '4FLH' },
    { id: 'p-59', code: '59CH' },
  ],
}

type Row = MoneyTransaction & { property_id?: string | null }

let n = 0
function txn(over: Partial<Row> = {}): Row {
  n++
  return {
    id: `t${n}`, account_id: 'acc-s', txn_date: '2025-01-01',
    description: `desc ${n}`, amount: -10, currency: 'GBP',
    category_id: null, category_source: null, property_id: null,
    dedupe_key: `k${n}`,
    ...over,
  } as Row
}

const codes = (rows: Row[]) => rows.map(r => r.id)

describe('sortTransactions', () => {
  it('sorts by date, newest first by default', () => {
    const rows = [
      txn({ id: 'old', txn_date: '2024-03-01' }),
      txn({ id: 'new', txn_date: '2025-06-01' }),
      txn({ id: 'mid', txn_date: '2024-12-25' }),
    ]
    expect(codes(sortTransactions(rows, { key: 'date', dir: 'desc' }, lookups)))
      .toEqual(['new', 'mid', 'old'])
    expect(codes(sortTransactions(rows, { key: 'date', dir: 'asc' }, lookups)))
      .toEqual(['old', 'mid', 'new'])
  })

  it('does not mutate the input', () => {
    const rows = [txn({ id: 'a', txn_date: '2024-01-01' }), txn({ id: 'b', txn_date: '2025-01-01' })]
    const before = codes(rows)
    sortTransactions(rows, { key: 'date', dir: 'desc' }, lookups)
    expect(codes(rows)).toEqual(before)
  })

  it('sorts amounts numerically, not as text', () => {
    // '-1000' < '-90' as strings but not as money. A string sort here would put
    // a £90 outgoing above a £1,000 one.
    const rows = [
      txn({ id: 'small', amount: -90 }),
      txn({ id: 'big', amount: -1000 }),
      txn({ id: 'in', amount: 250 }),
    ]
    expect(codes(sortTransactions(rows, { key: 'amount', dir: 'asc' }, lookups)))
      .toEqual(['big', 'small', 'in'])
    expect(codes(sortTransactions(rows, { key: 'amount', dir: 'desc' }, lookups)))
      .toEqual(['in', 'small', 'big'])
  })

  it('handles amounts stored as numeric strings', () => {
    // Postgres numeric arrives as a string through PostgREST.
    const rows = [
      txn({ id: 'a', amount: '-1000' as unknown as number }),
      txn({ id: 'b', amount: '-90' as unknown as number }),
    ]
    expect(codes(sortTransactions(rows, { key: 'amount', dir: 'asc' }, lookups)))
      .toEqual(['a', 'b'])
  })

  it('sorts accounts by name, not by id', () => {
    // 'acc-b' < 'acc-s' by id AND 'Barclays' < 'Starling' by name, so make the
    // ids order the opposite way to the names to prove which one is used.
    const rows = [
      txn({ id: 'starling', account_id: 'acc-s' }),
      txn({ id: 'barclays', account_id: 'acc-b' }),
    ]
    const named: Lookups = {
      ...lookups,
      accounts: [{ id: 'acc-s', name: 'Aardvark' }, { id: 'acc-b', name: 'Zebra' }],
    }
    expect(codes(sortTransactions(rows, { key: 'account', dir: 'asc' }, named)))
      .toEqual(['starling', 'barclays'])
  })

  it('sorts categories and properties by their display names', () => {
    const rows = [
      txn({ id: 'u', category_id: 'cat-u' }),
      txn({ id: 'g', category_id: 'cat-g' }),
    ]
    expect(codes(sortTransactions(rows, { key: 'category', dir: 'asc' }, lookups)))
      .toEqual(['g', 'u'])

    const props = [
      txn({ id: 'p59', property_id: 'p-59' }),
      txn({ id: 'p4', property_id: 'p-4' }),
    ]
    expect(codes(sortTransactions(props, { key: 'property', dir: 'asc' }, lookups)))
      .toEqual(['p4', 'p59'])
  })

  it('puts blanks last in BOTH directions', () => {
    // The point of sorting by Category is usually to find what is not
    // categorised. If descending pushed the blanks to the bottom, the rows that
    // need attention would be the hardest to reach.
    const rows = [
      txn({ id: 'blank', category_id: null }),
      txn({ id: 'u', category_id: 'cat-u' }),
      txn({ id: 'g', category_id: 'cat-g' }),
    ]
    expect(codes(sortTransactions(rows, { key: 'category', dir: 'asc' }, lookups)))
      .toEqual(['g', 'u', 'blank'])
    expect(codes(sortTransactions(rows, { key: 'category', dir: 'desc' }, lookups)))
      .toEqual(['u', 'g', 'blank'])
  })

  it('treats an unknown id as blank rather than dropping the row', () => {
    // A category deleted underneath the page must not make its transactions
    // vanish from the table.
    const rows = [
      txn({ id: 'ghost', category_id: 'cat-deleted' }),
      txn({ id: 'g', category_id: 'cat-g' }),
    ]
    const out = sortTransactions(rows, { key: 'category', dir: 'asc' }, lookups)
    expect(out).toHaveLength(2)
    expect(codes(out)).toEqual(['g', 'ghost'])
  })

  it('breaks ties on date, newest first, in both directions', () => {
    const rows = [
      txn({ id: 'jan', account_id: 'acc-s', txn_date: '2025-01-01' }),
      txn({ id: 'jun', account_id: 'acc-s', txn_date: '2025-06-01' }),
      txn({ id: 'mar', account_id: 'acc-s', txn_date: '2025-03-01' }),
    ]
    for (const dir of ['asc', 'desc'] as const) {
      expect(codes(sortTransactions(rows, { key: 'account', dir }, lookups)))
        .toEqual(['jun', 'mar', 'jan'])
    }
  })

  it('is case-insensitive on text', () => {
    const rows = [
      txn({ id: 'upper', description: 'ZARA' }),
      txn({ id: 'lower', description: 'aldi' }),
    ]
    // A plain codepoint sort puts every capital before every lowercase letter,
    // so 'ZARA' would come before 'aldi'.
    expect(codes(sortTransactions(rows, { key: 'description', dir: 'asc' }, lookups)))
      .toEqual(['lower', 'upper'])
  })

  it('returns every row it was given', () => {
    const rows = [txn(), txn(), txn(), txn()]
    for (const key of ['date', 'description', 'account', 'amount', 'category', 'property'] as const) {
      expect(sortTransactions(rows, { key, dir: 'asc' }, lookups)).toHaveLength(4)
    }
  })

  it('copes with empty lookups', () => {
    const rows = [txn({ id: 'a' }), txn({ id: 'b' })]
    const empty: Lookups = { accounts: [], categories: [], properties: [] }
    expect(sortTransactions(rows, { key: 'account', dir: 'asc' }, empty)).toHaveLength(2)
  })
})

describe('nextSort', () => {
  it('flips direction when the same column is clicked again', () => {
    const start: Sort = { key: 'date', dir: 'desc' }
    const flipped = nextSort(start, 'date')
    expect(flipped).toEqual({ key: 'date', dir: 'asc' })
    expect(nextSort(flipped, 'date')).toEqual({ key: 'date', dir: 'desc' })
  })

  it('uses the column default when a different column is clicked', () => {
    // Not the previous direction: arriving at Description in 'desc' because the
    // last sort happened to be descending reads as broken.
    expect(nextSort({ key: 'date', dir: 'desc' }, 'description'))
      .toEqual({ key: 'description', dir: 'asc' })
    expect(nextSort({ key: 'description', dir: 'asc' }, 'amount'))
      .toEqual({ key: 'amount', dir: 'desc' })
  })

  it('defaults dates and amounts to descending, names to ascending', () => {
    expect(DEFAULT_DIR.date).toBe('desc')
    expect(DEFAULT_DIR.amount).toBe('desc')
    expect(DEFAULT_DIR.description).toBe('asc')
    expect(DEFAULT_DIR.account).toBe('asc')
    expect(DEFAULT_DIR.category).toBe('asc')
    expect(DEFAULT_DIR.property).toBe('asc')
  })
})
