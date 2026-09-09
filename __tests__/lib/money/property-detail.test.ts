import { buildPropertyDetail } from '@/lib/money/property-detail'
import { taxYearBounds } from '@/lib/money/property-pl'
import type { MoneyProperty, PropertyTreatment } from '@/lib/money/property-types'
import type { MoneyCategory, MoneyTransaction } from '@/lib/money/spending-types'
import type { MoneyAccount } from '@/lib/money/types'

type Cat = MoneyCategory & { property_treatment?: PropertyTreatment | null }
type Txn = MoneyTransaction & { property_id?: string | null }

const cat = (id: string, name: string, kind: MoneyCategory['kind'],
  t: PropertyTreatment | null): Cat =>
  ({ id, user_id: 'u', name, kind, sort_order: 1, created_at: 'x', property_treatment: t } as Cat)

const CATS: Cat[] = [
  cat('rent', 'Rent received', 'income', 'rental_income'),
  cat('repairs', 'Property repairs', 'spending', 'allowable'),
  cat('interest', 'Mortgage interest', 'spending', 'interest'),
  cat('improve', 'Property improvements', 'spending', 'capital'),
  cat('groceries', 'Groceries', 'spending', null),
]

const ACCOUNTS: MoneyAccount[] = [
  { id: 'a1', user_id: 'u', name: 'Barclays', kind: 'current', currency: 'GBP',
    created_at: 'x' } as MoneyAccount,
]

const prop = (over: Partial<MoneyProperty> = {}): MoneyProperty =>
  ({ id: 'p1', user_id: 'u', code: '4FLH', label: 'Flat F', share_percent: 100,
    disposed_date: null, created_at: 'x', ...over } as MoneyProperty)

let n = 0
const txn = (over: Partial<Txn> = {}): Txn => {
  n++
  return {
    id: `t${n}`, user_id: 'u', account_id: 'a1', txn_date: '2024-06-01',
    description: `d${n}`, amount: -100, currency: 'GBP',
    category_id: 'repairs', category_source: 'manual', property_id: 'p1',
    dedupe_key: `k${n}`, created_at: 'x', ...over,
  } as Txn
}

const YEAR = taxYearBounds('2024/25')

describe('buildPropertyDetail', () => {
  it('groups the transactions behind each figure', () => {
    const d = buildPropertyDetail(prop(), [
      txn({ amount: 1200, category_id: 'rent' }),
      txn({ amount: 1200, category_id: 'rent' }),
      txn({ amount: -300, category_id: 'repairs' }),
      txn({ amount: -800, category_id: 'interest' }),
    ], CATS, ACCOUNTS, YEAR)

    expect(d.groups.map(g => [g.treatment, g.total])).toEqual([
      ['rental_income', 2400],
      ['allowable', 300],
      ['interest', 800],
    ])
    expect(d.groups[0].lines).toHaveLength(2)
  })

  it('agrees with the portfolio arithmetic', () => {
    // The row comes from buildPropertyPL, so cash and taxable profit cannot
    // drift from the portfolio table for the same property.
    const d = buildPropertyDetail(prop(), [
      txn({ amount: 12000, category_id: 'rent' }),
      txn({ amount: -2000, category_id: 'repairs' }),
      txn({ amount: -9000, category_id: 'interest' }),
    ], CATS, ACCOUNTS, YEAR)

    expect(d.row.rentReceived).toBe(12000)
    expect(d.row.cashProfit).toBe(1000)     // 12000 - 2000 - 9000
    expect(d.row.taxableProfit).toBe(10000) // interest excluded: Section 24
    expect(d.row.interestTaxReducer).toBe(1800) // 20% of min(9000, 10000)
  })

  it('excludes transactions tagged to a different property', () => {
    const d = buildPropertyDetail(prop(), [
      txn({ amount: 1200, category_id: 'rent' }),
      txn({ amount: 5000, category_id: 'rent', property_id: 'other' }),
    ], CATS, ACCOUNTS, YEAR)
    expect(d.row.rentReceived).toBe(1200)
    expect(d.groups[0].lines).toHaveLength(1)
  })

  it('excludes transactions outside the period', () => {
    const d = buildPropertyDetail(prop(), [
      txn({ amount: 1200, category_id: 'rent', txn_date: '2024-06-01' }),
      txn({ amount: 9999, category_id: 'rent', txn_date: '2025-04-06' }), // next year
      txn({ amount: 8888, category_id: 'rent', txn_date: '2024-04-05' }), // previous year
    ], CATS, ACCOUNTS, YEAR)
    expect(d.row.rentReceived).toBe(1200)
    expect(d.groups[0].lines).toHaveLength(1)
  })

  it('shows a property-tagged row whose category has no treatment', () => {
    // Tagged to the flat but categorised as Groceries: it belongs to no figure,
    // so it must still be visible rather than silently dropped.
    const d = buildPropertyDetail(prop(), [
      txn({ amount: -60, category_id: 'groceries' }),
    ], CATS, ACCOUNTS, YEAR)

    const untreated = d.groups.find(g => g.treatment === 'untreated')
    expect(untreated?.lines).toHaveLength(1)
    expect(untreated?.total).toBe(60)
  })

  it('names an uncategorised row rather than leaving it blank', () => {
    const d = buildPropertyDetail(prop(), [
      txn({ amount: -60, category_id: null }),
    ], CATS, ACCOUNTS, YEAR)
    expect(d.groups[0].lines[0].categoryName).toBe('Uncategorised')
  })

  it('scales every line by share, so the lines add up to the total', () => {
    const d = buildPropertyDetail(prop({ share_percent: 50 }), [
      txn({ amount: 1000, category_id: 'rent' }),
      txn({ amount: -400, category_id: 'repairs' }),
    ], CATS, ACCOUNTS, YEAR)

    expect(d.row.rentReceived).toBe(500)
    expect(d.groups[0].lines[0].amount).toBe(500)
    expect(d.groups[0].total).toBe(500)
    expect(d.groups[1].total).toBe(200)
  })

  it('lists newest first', () => {
    const d = buildPropertyDetail(prop(), [
      txn({ amount: 100, category_id: 'rent', txn_date: '2024-06-01' }),
      txn({ amount: 100, category_id: 'rent', txn_date: '2024-09-01' }),
      txn({ amount: 100, category_id: 'rent', txn_date: '2024-07-01' }),
    ], CATS, ACCOUNTS, YEAR)
    expect(d.groups[0].lines.map(l => l.date))
      .toEqual(['2024-09-01', '2024-07-01', '2024-06-01'])
  })

  describe('by month', () => {
    it('records rent in the month it arrives', () => {
      const d = buildPropertyDetail(prop(), [
        txn({ amount: 1200, category_id: 'rent', txn_date: '2024-06-01' }),
        txn({ amount: 1200, category_id: 'rent', txn_date: '2024-08-01' }),
      ], CATS, ACCOUNTS, YEAR)

      // July has no row. That is not evidence of arrears — rent on this
      // portfolio is sometimes paid three or six months in advance.
      expect(d.byMonth.map(m => [m.month, m.rent]))
        .toEqual([['2024-06', 1200], ['2024-08', 1200]])
    })

    it('running totals make a six-month advance read correctly', () => {
      // The real 85KX shape: interest leaves monthly, rent arrives in lumps.
      // Month by month this looks like five months of arrears; the cumulative
      // columns show the year is ahead from the moment the advance lands.
      const rows = [
        ...['2024-04', '2024-05', '2024-06', '2024-07', '2024-08', '2024-09'].map(m =>
          txn({ amount: -1000, category_id: 'interest', txn_date: `${m}-15` })),
        // The 10th, not the 2nd: the tax year starts on 6 April, so an advance
        // paid days earlier belongs to the previous year entirely.
        txn({ amount: 7200, category_id: 'rent', txn_date: '2024-04-10' }),
      ]
      const d = buildPropertyDetail(prop(), rows, CATS, ACCOUNTS, YEAR)

      const april = d.byMonth[0]
      expect(april.rent).toBe(7200)
      expect(april.cumulativeRent).toBe(7200)

      // Every later month shows no rent but stays ahead cumulatively.
      for (const m of d.byMonth.slice(1)) {
        expect(m.rent).toBe(0)
        expect(m.rent - m.expenses).toBeLessThan(0)
        expect(m.cumulativeRent - m.cumulativeExpenses).toBeGreaterThan(0)
      }

      const last = d.byMonth[d.byMonth.length - 1]
      expect(last.cumulativeRent).toBe(7200)
      expect(last.cumulativeExpenses).toBe(6000)
      expect(last.cumulativeRent - last.cumulativeExpenses).toBe(1200)
    })

    it('accumulates in date order, not insertion order', () => {
      const d = buildPropertyDetail(prop(), [
        txn({ amount: 100, category_id: 'rent', txn_date: '2024-12-01' }),
        txn({ amount: 300, category_id: 'rent', txn_date: '2024-06-01' }),
      ], CATS, ACCOUNTS, YEAR)
      expect(d.byMonth.map(m => m.cumulativeRent)).toEqual([300, 400])
    })

    it('counts a refund to the tenant as an expense, not as negative rent', () => {
      // Netting it off rent would hide both the rent and the refund.
      const d = buildPropertyDetail(prop(), [
        txn({ amount: 1200, category_id: 'rent', txn_date: '2024-06-01' }),
        txn({ amount: -200, category_id: 'rent', txn_date: '2024-06-15' }),
      ], CATS, ACCOUNTS, YEAR)

      expect(d.byMonth[0]).toMatchObject({ month: '2024-06', rent: 1200, expenses: 200 })
    })

    it('is ordered oldest first, so it reads as a timeline', () => {
      const d = buildPropertyDetail(prop(), [
        txn({ amount: 100, category_id: 'rent', txn_date: '2024-12-01' }),
        txn({ amount: 100, category_id: 'rent', txn_date: '2024-06-01' }),
      ], CATS, ACCOUNTS, YEAR)
      expect(d.byMonth.map(m => m.month)).toEqual(['2024-06', '2024-12'])
    })
  })

  it('respects a disposal date', () => {
    const d = buildPropertyDetail(prop({ disposed_date: '2024-08-31' }), [
      txn({ amount: 1200, category_id: 'rent', txn_date: '2024-08-01' }),
      txn({ amount: 1200, category_id: 'rent', txn_date: '2024-09-01' }),
    ], CATS, ACCOUNTS, YEAR)
    expect(d.row.rentReceived).toBe(1200)
    expect(d.groups[0].lines).toHaveLength(1)
  })

  it('returns empty groups rather than throwing when there is nothing', () => {
    const d = buildPropertyDetail(prop(), [], CATS, ACCOUNTS, YEAR)
    expect(d.groups).toEqual([])
    expect(d.byMonth).toEqual([])
    expect(d.row.cashProfit).toBe(0)
  })
})

describe('rent paid in advance', () => {
  // £21,600 banked 28 Feb 2025 covering February to September: two months in
  // 2024/25, six in 2025/26.
  const advance = txn({
    amount: 21600, category_id: 'rent', txn_date: '2025-02-28',
    covers_from: '2025-02-01', covers_to: '2025-09-30',
  } as never)

  it('reports both bases for the year it was banked in', () => {
    const d = buildPropertyDetail(prop(), [advance], CATS, ACCOUNTS, YEAR)
    const rent = d.groups[0]

    expect(rent.total).toBe(21600)      // cash: all of it arrived
    expect(rent.accruedTotal).toBe(5400) // accruals: Feb + Mar only
    expect(d.hasAccruals).toBe(true)
  })

  it('lists a payment banked before the period it accrues into', () => {
    // The 2025/26 view must show the February payment, or its £16,200 of
    // accrued rent could not be explained by anything on screen.
    const next = taxYearBounds('2025/26')
    const d = buildPropertyDetail(prop(), [advance], CATS, ACCOUNTS, next)
    const rent = d.groups[0]

    expect(rent.lines).toHaveLength(1)
    expect(rent.lines[0].paidOutsidePeriod).toBe(true)
    expect(rent.lines[0].accrued).toBe(16200)
    expect(rent.total).toBe(0)           // nothing was banked in this year
    expect(rent.accruedTotal).toBe(16200)
  })

  it('spreads the advance across the months it covers', () => {
    // The whole point: instead of one £21,600 spike and five blanks, each
    // covered month shows its £2,700.
    const d = buildPropertyDetail(prop(), [advance], CATS, ACCOUNTS, YEAR)
    expect(d.byMonth.map(m => [m.month, m.rent]))
      .toEqual([['2025-02', 2700], ['2025-03', 2700]])
  })

  it('carries the covered period onto the line', () => {
    const d = buildPropertyDetail(prop(), [advance], CATS, ACCOUNTS, YEAR)
    expect(d.groups[0].lines[0]).toMatchObject({
      coversFrom: '2025-02-01', coversTo: '2025-09-30', spread: true,
    })
  })

  it('leaves an unaccrued payment on both bases equal', () => {
    const plain = txn({ amount: 1200, category_id: 'rent', txn_date: '2024-06-01' })
    const d = buildPropertyDetail(prop(), [plain], CATS, ACCOUNTS, YEAR)

    expect(d.groups[0].total).toBe(1200)
    expect(d.groups[0].accruedTotal).toBe(1200)
    expect(d.hasAccruals).toBe(false)
    expect(d.byMonth).toEqual([expect.objectContaining({ month: '2024-06', rent: 1200 })])
  })

  it('scales an accrued line by share', () => {
    const d = buildPropertyDetail(prop({ share_percent: 50 }), [advance], CATS, ACCOUNTS, YEAR)
    expect(d.groups[0].accruedTotal).toBe(2700)
    expect(d.groups[0].lines[0].accrued).toBe(2700)
    expect(d.byMonth[0].rent).toBe(1350)
  })

  it('does not pull an unrelated out-of-period expense into view', () => {
    // Only rent accrues. An interest payment from another year stays out.
    const old = txn({ amount: -4000, category_id: 'interest', txn_date: '2023-06-01' })
    const d = buildPropertyDetail(prop(), [advance, old], CATS, ACCOUNTS, YEAR)
    expect(d.groups.find(g => g.treatment === 'interest')).toBeUndefined()
  })
})
