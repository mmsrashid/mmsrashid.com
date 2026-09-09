import {
  buildPersonalPL, isPersonalRow, treatmentMap, taxYearOf,
} from '@/lib/money/personal-book'
import type { MoneyCategory, MoneyTransaction } from '@/lib/money/spending-types'
import type { PropertyTreatment } from '@/lib/money/property-types'
import type { MoneyAccount } from '@/lib/money/types'

type Cat = MoneyCategory & { property_treatment?: PropertyTreatment | null }
type Txn = MoneyTransaction & { property_id?: string | null }

const cat = (id: string, name: string, kind: MoneyCategory['kind'],
  treatment: PropertyTreatment | null = null): Cat =>
  ({ id, user_id: 'u', name, kind, sort_order: 1, created_at: 'x',
    property_treatment: treatment } as Cat)

const CATS: Cat[] = [
  cat('groceries', 'Groceries', 'spending'),
  cat('salary', 'Salary', 'income'),
  cat('xfer', 'Transfer', 'transfer'),
  cat('rent-in', 'Rent received', 'income', 'rental_income'),
  cat('interest', 'Mortgage interest', 'spending', 'interest'),
]

const ACCOUNTS: MoneyAccount[] = [
  { id: 'a1', user_id: 'u', name: 'Starling', kind: 'current', currency: 'GBP',
    created_at: 'x' } as MoneyAccount,
]

let n = 0
const txn = (over: Partial<Txn> = {}): Txn => {
  n++
  return {
    id: `t${n}`, user_id: 'u', account_id: 'a1', txn_date: '2025-06-10',
    description: `d${n}`, amount: -10, currency: 'GBP',
    category_id: 'groceries', category_source: 'manual', property_id: null,
    dedupe_key: `k${n}`, created_at: 'x',
    ...over,
  } as Txn
}

describe('taxYearOf', () => {
  it('turns the year on 6 April', () => {
    expect(taxYearOf('2025-04')).toBe('2025/26')
    expect(taxYearOf('2025-12')).toBe('2025/26')
    expect(taxYearOf('2026-03')).toBe('2025/26')
    expect(taxYearOf('2026-04')).toBe('2026/27')
  })

  it('pads the second year', () => {
    // 2009/10, not 2009/1.
    expect(taxYearOf('2009-06')).toBe('2009/10')
  })
})

describe('isPersonalRow', () => {
  const m = treatmentMap(CATS)

  it('is personal when there is no property tag and no property category', () => {
    expect(isPersonalRow(txn({ category_id: 'groceries' }), m)).toBe(true)
  })

  it('is not personal once tagged to a property', () => {
    // The tag is the boundary. Even a plainly personal category becomes
    // property spending when the user says it was for a flat.
    expect(isPersonalRow(txn({ category_id: 'groceries', property_id: 'p1' }), m)).toBe(false)
  })

  it('is not personal when the category belongs to the property book', () => {
    // Held for review, not counted as personal: dropping rent into the personal
    // P&L because nobody tagged it would misstate both books.
    expect(isPersonalRow(txn({ category_id: 'rent-in' }), m)).toBe(false)
    expect(isPersonalRow(txn({ category_id: 'interest' }), m)).toBe(false)
  })

  it('treats an uncategorised, untagged row as personal', () => {
    expect(isPersonalRow(txn({ category_id: null }), m)).toBe(true)
  })

  it('treats an unknown category id as personal', () => {
    // A category deleted underneath the row must not push it into the property
    // book, where it would be attributed to no property at all.
    expect(isPersonalRow(txn({ category_id: 'deleted' }), m)).toBe(true)
  })
})

describe('buildPersonalPL', () => {
  it('excludes property-tagged rows from the personal totals', () => {
    const pl = buildPersonalPL([
      txn({ amount: -100, category_id: 'groceries' }),
      txn({ amount: -900, category_id: 'groceries', property_id: 'p1' }),
    ], CATS, ACCOUNTS, '2025-06')

    expect(pl.month.totalOut).toBe(100)
    expect(pl.propertyRowCount).toBe(1)
  })

  it('holds a property category with no tag out of both totals, and counts it', () => {
    const pl = buildPersonalPL([
      txn({ amount: -100, category_id: 'groceries' }),
      txn({ amount: 1500, category_id: 'rent-in' }),
      txn({ amount: -400, category_id: 'interest' }),
    ], CATS, ACCOUNTS, '2025-06')

    expect(pl.month.totalOut).toBe(100)
    expect(pl.month.totalIn).toBe(0)
    expect(pl.heldForReviewCount).toBe(2)
    expect(pl.heldForReviewValue).toBe(1100)
  })

  it('reports income and expenses separately', () => {
    const pl = buildPersonalPL([
      txn({ amount: 3000, category_id: 'salary' }),
      txn({ amount: -250, category_id: 'groceries' }),
    ], CATS, ACCOUNTS, '2025-06')

    expect(pl.month.totalIn).toBe(3000)
    expect(pl.month.totalOut).toBe(250)
    expect(pl.month.net).toBe(2750)
  })

  it('still excludes transfers between the user own accounts', () => {
    const pl = buildPersonalPL([
      txn({ amount: -500, category_id: 'xfer' }),
      txn({ amount: -100, category_id: 'groceries' }),
    ], CATS, ACCOUNTS, '2025-06')
    expect(pl.month.totalOut).toBe(100)
  })

  describe('year to date', () => {
    const rows = [
      txn({ amount: -100, txn_date: '2025-04-06' }),  // first day of 2025/26
      txn({ amount: -200, txn_date: '2025-06-10' }),  // the month being viewed
      txn({ amount: -400, txn_date: '2025-09-01' }),  // later in the same year
      txn({ amount: -800, txn_date: '2025-03-20' }),  // previous tax year
    ]

    it('accumulates from 6 April to the end of the viewed month', () => {
      const pl = buildPersonalPL(rows, CATS, ACCOUNTS, '2025-06')
      expect(pl.taxYear).toBe('2025/26')
      // 100 + 200. Not the 400 that comes later, and not the 800 from before.
      expect(pl.yearToDate.totalOut).toBe(300)
      expect(pl.month.totalOut).toBe(200)
    })

    it('does not reach back into the previous tax year', () => {
      const pl = buildPersonalPL(rows, CATS, ACCOUNTS, '2026-03')
      expect(pl.taxYear).toBe('2025/26')
      expect(pl.yearToDate.totalOut).toBe(700)
    })

    it('covers a whole month regardless of its length', () => {
      // The upper bound is a string, so February must still admit the 28th.
      const feb = [txn({ amount: -50, txn_date: '2026-02-28' })]
      const pl = buildPersonalPL(feb, CATS, ACCOUNTS, '2026-02')
      expect(pl.yearToDate.totalOut).toBe(50)
      expect(pl.month.totalOut).toBe(50)
    })

    it('excludes property rows from the year to date as well', () => {
      const pl = buildPersonalPL([
        txn({ amount: -100, txn_date: '2025-04-06' }),
        txn({ amount: -900, txn_date: '2025-05-01', property_id: 'p1' }),
      ], CATS, ACCOUNTS, '2025-06')
      expect(pl.yearToDate.totalOut).toBe(100)
    })
  })

  it('returns zeroes rather than throwing on an empty month', () => {
    const pl = buildPersonalPL([], CATS, ACCOUNTS, '2025-06')
    expect(pl.month.totalOut).toBe(0)
    expect(pl.yearToDate.totalOut).toBe(0)
    expect(pl.heldForReviewCount).toBe(0)
  })
})
