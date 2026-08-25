import { buildPropertyPL, taxYearBounds } from '@/lib/money/property-pl'
import type { MoneyProperty, PropertyTreatment } from '@/lib/money/property-types'
import type { MoneyCategory, MoneyTransaction } from '@/lib/money/spending-types'
import type { MoneyAccount } from '@/lib/money/types'

const prop = (over: Partial<MoneyProperty> & { id: string; code: string }): MoneyProperty => ({
  user_id: 'u', label: null, ownership: 'personal', share_percent: 100,
  acquired_date: null, disposed_date: null, status: 'active', notes: null,
  created_at: '2025-01-01T00:00:00Z', ...over,
})

type CatWithTreatment = MoneyCategory & { property_treatment: PropertyTreatment | null }

const cat = (id: string, treatment: PropertyTreatment | null): CatWithTreatment => ({
  id, user_id: 'u', name: id, kind: treatment === 'rental_income' ? 'income' : 'spending',
  sort_order: 0, created_at: '2025-01-01T00:00:00Z', property_treatment: treatment,
})

type TxnWithProperty = MoneyTransaction & { property_id: string | null }

const txn = (
  amount: number, category_id: string, property_id: string | null, txn_date = '2026-05-10',
): TxnWithProperty => ({
  id: `${amount}-${category_id}-${txn_date}-${property_id}`, user_id: 'u', account_id: 'a',
  txn_date, description: 'x', merchant: null, amount, category_id,
  category_source: 'rule', document_id: null, external_id: null,
  dedupe_key: `${amount}-${category_id}-${txn_date}-${property_id}`, notes: null,
  created_at: `${txn_date}T00:00:00Z`, property_id,
})

const acct = (currency = 'GBP'): MoneyAccount => ({
  id: 'a', user_id: 'u', name: 'a', institution: null, kind: 'current', currency,
  opened_date: null, closed_date: null, status: 'active', notes: null,
  created_at: '2025-01-01T00:00:00Z',
})

const CATS = [
  cat('rent', 'rental_income'),
  cat('repairs', 'allowable'),
  cat('interest', 'interest'),
  cat('improve', 'capital'),
  cat('fine', 'non_allowable'),
]

const YEAR = taxYearBounds('2026/27')

describe('taxYearBounds', () => {
  it('runs 6 April to 5 April, not the calendar year', () => {
    // A calendar-year filter would misfile every early-April transaction.
    expect(taxYearBounds('2026/27')).toEqual({ from: '2026-04-06', to: '2027-04-05' })
  })

  it('accepts a single start year', () => {
    expect(taxYearBounds('2026')).toEqual({ from: '2026-04-06', to: '2027-04-05' })
  })
})

describe('buildPropertyPL', () => {
  it('returns zeros, not NaN, with no transactions', () => {
    const r = buildPropertyPL([prop({ id: 'p', code: '4FLH' })], [], CATS, [acct()], YEAR)
    expect(r.totals).toMatchObject({
      rentReceived: 0, cashProfit: 0, taxableProfit: 0, interestTaxReducer: 0,
    })
    expect(r.perProperty[0].code).toBe('4FLH')
  })

  it('excludes mortgage interest from taxable profit but includes it in cash profit', () => {
    // The whole point of Section 24. Rent 12000, repairs 1000, interest 5000.
    const r = buildPropertyPL(
      [prop({ id: 'p', code: '4FLH' })],
      [txn(12000, 'rent', 'p'), txn(-1000, 'repairs', 'p'), txn(-5000, 'interest', 'p')],
      CATS, [acct()], YEAR,
    )
    const p = r.perProperty[0]
    expect(p.rentReceived).toBe(12000)
    expect(p.allowableExpenses).toBe(1000)
    expect(p.mortgageInterest).toBe(5000)
    expect(p.cashProfit).toBe(6000)     // 12000 - 1000 - 5000
    expect(p.taxableProfit).toBe(11000) // 12000 - 1000, interest excluded
  })

  it('gives a 20% reducer on interest when profit covers it', () => {
    const r = buildPropertyPL(
      [prop({ id: 'p', code: '4FLH' })],
      [txn(12000, 'rent', 'p'), txn(-5000, 'interest', 'p')],
      CATS, [acct()], YEAR,
    )
    expect(r.perProperty[0].interestTaxReducer).toBe(1000) // 20% of 5000
  })

  it('caps the reducer at 20% of taxable profit', () => {
    // Interest 5000 but taxable profit only 2000: relief is limited to the lower
    // of finance costs and property profits, so 20% of 2000, not of 5000.
    const r = buildPropertyPL(
      [prop({ id: 'p', code: '4FLH' })],
      [txn(3000, 'rent', 'p'), txn(-1000, 'repairs', 'p'), txn(-5000, 'interest', 'p')],
      CATS, [acct()], YEAR,
    )
    const p = r.perProperty[0]
    expect(p.taxableProfit).toBe(2000)
    expect(p.interestTaxReducer).toBe(400) // 20% of 2000
    expect(p.reducerCapped).toBe(true)
  })

  it('gives no reducer in a loss-making year', () => {
    const r = buildPropertyPL(
      [prop({ id: 'p', code: '4FLH' })],
      [txn(1000, 'rent', 'p'), txn(-3000, 'repairs', 'p'), txn(-5000, 'interest', 'p')],
      CATS, [acct()], YEAR,
    )
    const p = r.perProperty[0]
    expect(p.taxableProfit).toBe(-2000)
    expect(p.interestTaxReducer).toBe(0)
  })

  it('applies share_percent to every figure, not just profit', () => {
    const r = buildPropertyPL(
      [prop({ id: 'p', code: '59CH', share_percent: 50 })],
      [txn(12000, 'rent', 'p'), txn(-1000, 'repairs', 'p'), txn(-5000, 'interest', 'p')],
      CATS, [acct()], YEAR,
    )
    const p = r.perProperty[0]
    expect(p.rentReceived).toBe(6000)
    expect(p.allowableExpenses).toBe(500)
    expect(p.mortgageInterest).toBe(2500)
    expect(p.cashProfit).toBe(3000)
    expect(p.taxableProfit).toBe(5500)
  })

  it('reports capital spend but excludes it from both profits', () => {
    const r = buildPropertyPL(
      [prop({ id: 'p', code: '4FLH' })],
      [txn(10000, 'rent', 'p'), txn(-8000, 'improve', 'p')],
      CATS, [acct()], YEAR,
    )
    const p = r.perProperty[0]
    expect(p.capitalSpend).toBe(8000)
    expect(p.cashProfit).toBe(10000)
    expect(p.taxableProfit).toBe(10000)
  })

  it('deducts a non-allowable cost from cash but not taxable profit', () => {
    const r = buildPropertyPL(
      [prop({ id: 'p', code: '4FLH' })],
      [txn(10000, 'rent', 'p'), txn(-500, 'fine', 'p')],
      CATS, [acct()], YEAR,
    )
    const p = r.perProperty[0]
    expect(p.otherNonAllowable).toBe(500)
    expect(p.cashProfit).toBe(9500)
    expect(p.taxableProfit).toBe(10000)
  })

  it('excludes a property after its disposal date but keeps earlier history', () => {
    const r = buildPropertyPL(
      [prop({ id: 'p', code: '85KX', status: 'sold', disposed_date: '2026-06-30' })],
      [txn(1000, 'rent', 'p', '2026-06-01'), txn(1000, 'rent', 'p', '2026-07-01')],
      CATS, [acct()], YEAR,
    )
    expect(r.perProperty[0].rentReceived).toBe(1000)
  })

  it('ignores transactions outside the period', () => {
    const r = buildPropertyPL(
      [prop({ id: 'p', code: '4FLH' })],
      [txn(1000, 'rent', 'p', '2026-04-05'), txn(2000, 'rent', 'p', '2026-04-06')],
      CATS, [acct()], YEAR,
    )
    expect(r.perProperty[0].rentReceived).toBe(2000)
  })

  it('counts property transactions whose category has no treatment as unclassified', () => {
    // A P&L missing half its expenses looks like a very profitable portfolio.
    const r = buildPropertyPL(
      [prop({ id: 'p', code: '4FLH' })],
      [txn(1000, 'rent', 'p'), txn(-250, 'misc', 'p')],
      [...CATS, cat('misc', null)], [acct()], YEAR,
    )
    expect(r.perProperty[0].unclassifiedCount).toBe(1)
    expect(r.perProperty[0].unclassifiedValue).toBe(250)
  })

  it('counts transactions tagged to no property at all', () => {
    const r = buildPropertyPL(
      [prop({ id: 'p', code: '4FLH' })],
      [txn(1000, 'rent', 'p'), txn(-400, 'repairs', null)],
      CATS, [acct()], YEAR,
    )
    expect(r.untaggedCount).toBe(1)
    expect(r.untaggedValue).toBe(400)
  })

  it('sums the portfolio across properties', () => {
    const r = buildPropertyPL(
      [prop({ id: 'p1', code: '4FLH' }), prop({ id: 'p2', code: '24HH' })],
      [txn(6000, 'rent', 'p1'), txn(4000, 'rent', 'p2'), txn(-1000, 'interest', 'p1')],
      CATS, [acct()], YEAR,
    )
    expect(r.totals.rentReceived).toBe(10000)
    expect(r.totals.mortgageInterest).toBe(1000)
    expect(r.totals.cashProfit).toBe(9000)
    expect(r.totals.taxableProfit).toBe(10000)
  })

  it('refuses to sum across currencies', () => {
    // Two accounts actually used in the period, in different currencies.
    const r = buildPropertyPL(
      [prop({ id: 'p', code: '4FLH' })],
      [txn(1000, 'rent', 'p'), { ...txn(500, 'rent', 'p'), id: 'usd', account_id: 'b' }],
      CATS, [acct('GBP'), { ...acct('USD'), id: 'b' }], YEAR,
    )
    expect(r.currencyWarning).toMatch(/GBP/)
    expect(r.currencyWarning).toMatch(/USD/)
  })

  it('does not warn when a dormant account in another currency was not used', () => {
    // A USD account with no transactions this period must not block the total.
    const r = buildPropertyPL(
      [prop({ id: 'p', code: '4FLH' })],
      [txn(1000, 'rent', 'p')],
      CATS, [acct('GBP'), { ...acct('USD'), id: 'b' }], YEAR,
    )
    expect(r.currencyWarning).toBeNull()
    expect(r.perProperty[0].rentReceived).toBe(1000)
  })

  it('does not drift when summing pence amounts', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      txn(-0.1, 'repairs', 'p', `2026-05-0${i + 1}`))
    const r = buildPropertyPL([prop({ id: 'p', code: '4FLH' })], rows, CATS, [acct()], YEAR)
    expect(r.perProperty[0].allowableExpenses).toBe(1)
  })
})
