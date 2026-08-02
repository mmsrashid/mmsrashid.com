import { buildSpendingSummary } from '@/lib/money/spending-summary'
import type { MoneyCategory, MoneyTransaction } from '@/lib/money/spending-types'
import type { MoneyAccount } from '@/lib/money/types'

const cat = (id: string, name: string, kind: MoneyCategory['kind']): MoneyCategory =>
  ({ id, user_id: 'u', name, kind, sort_order: 0, created_at: '2026-01-01T00:00:00Z' })

const acct = (id: string, currency = 'GBP'): MoneyAccount => ({
  id, user_id: 'u', name: id, institution: null, kind: 'current', currency,
  opened_date: null, closed_date: null, status: 'active', notes: null,
  created_at: '2026-01-01T00:00:00Z',
})

const txn = (
  amount: number, category_id: string | null, txn_date = '2026-02-10', account_id = 'a',
): MoneyTransaction => ({
  id: `${amount}-${category_id}-${txn_date}-${account_id}`, user_id: 'u', account_id, txn_date,
  description: 'x', merchant: null, amount, category_id,
  category_source: category_id ? 'rule' : null, document_id: null,
  external_id: null, dedupe_key: `${amount}-${category_id}-${txn_date}-${account_id}`,
  notes: null, created_at: '2026-02-10T00:00:00Z',
})

const CATS = [
  cat('groceries', 'Groceries', 'spending'),
  cat('salary', 'Salary', 'income'),
  cat('transfer', 'Transfer', 'transfer'),
]

describe('buildSpendingSummary', () => {
  it('returns zeros, not NaN, for an empty month', () => {
    const r = buildSpendingSummary([], CATS, [acct('a')], '2026-02')
    expect(r).toMatchObject({ totalOut: 0, totalIn: 0, net: 0, uncategorisedCount: 0 })
    expect(r.byCategory).toEqual([])
  })

  it('totals money out as a positive figure', () => {
    const r = buildSpendingSummary([txn(-50, 'groceries')], CATS, [acct('a')], '2026-02')
    expect(r.totalOut).toBe(50)
    expect(r.totalIn).toBe(0)
    expect(r.net).toBe(-50)
  })

  it('excludes transfers from both totals', () => {
    // £500 out of current and into savings is not £500 of spending, nor income.
    const r = buildSpendingSummary(
      [txn(-500, 'transfer'), txn(500, 'transfer', '2026-02-10', 'b'), txn(-20, 'groceries')],
      CATS, [acct('a'), acct('b')], '2026-02',
    )
    expect(r.totalOut).toBe(20)
    expect(r.totalIn).toBe(0)
  })

  it('counts income separately', () => {
    const r = buildSpendingSummary([txn(2000, 'salary'), txn(-50, 'groceries')], CATS, [acct('a')], '2026-02')
    expect(r.totalIn).toBe(2000)
    expect(r.totalOut).toBe(50)
    expect(r.net).toBe(1950)
  })

  it('reports uncategorised count and value separately', () => {
    const r = buildSpendingSummary([txn(-30, null), txn(-50, 'groceries')], CATS, [acct('a')], '2026-02')
    expect(r.uncategorisedCount).toBe(1)
    expect(r.uncategorisedValue).toBe(30)
  })

  it('includes uncategorised spending in totalOut', () => {
    // Excluding it would understate the month while looking complete.
    const r = buildSpendingSummary([txn(-30, null)], CATS, [acct('a')], '2026-02')
    expect(r.totalOut).toBe(30)
  })

  it('treats a transaction with an unknown category as spending, not as missing', () => {
    const r = buildSpendingSummary([txn(-15, 'deleted-category')], CATS, [acct('a')], '2026-02')
    expect(r.totalOut).toBe(15)
  })

  it('includes both month boundary days', () => {
    const r = buildSpendingSummary(
      [txn(-1, 'groceries', '2026-02-01'), txn(-2, 'groceries', '2026-02-28')],
      CATS, [acct('a')], '2026-02',
    )
    expect(r.totalOut).toBe(3)
  })

  it('excludes other months', () => {
    const r = buildSpendingSummary(
      [txn(-1, 'groceries', '2026-01-31'), txn(-2, 'groceries', '2026-03-01')],
      CATS, [acct('a')], '2026-02',
    )
    expect(r.totalOut).toBe(0)
  })

  it('sorts categories by spend, largest first', () => {
    const r = buildSpendingSummary(
      [txn(-10, 'groceries'), txn(-90, 'other')],
      [cat('groceries', 'Groceries', 'spending'), cat('other', 'Other', 'spending')],
      [acct('a')], '2026-02',
    )
    expect(r.byCategory[0].total).toBe(90)
    expect(r.byCategory[0].share).toBeCloseTo(0.9)
  })

  it('refuses to sum across currencies', () => {
    const r = buildSpendingSummary(
      [txn(-10, 'groceries', '2026-02-10', 'a'), txn(-10, 'groceries', '2026-02-10', 'b')],
      CATS, [acct('a', 'GBP'), acct('b', 'USD')], '2026-02',
    )
    expect(r.currencyWarning).toMatch(/GBP/)
    expect(r.currencyWarning).toMatch(/USD/)
    expect(r.totalOut).toBe(0)
  })

  it('does not warn when only one currency is actually used that month', () => {
    // A dormant USD account with no transactions this month must not block the total.
    const r = buildSpendingSummary(
      [txn(-10, 'groceries', '2026-02-10', 'a')],
      CATS, [acct('a', 'GBP'), acct('b', 'USD')], '2026-02',
    )
    expect(r.currencyWarning).toBeNull()
    expect(r.totalOut).toBe(10)
  })

  it('does not drift when summing pence amounts', () => {
    const rows = Array.from({ length: 10 }, (_, i) => txn(-0.1, 'groceries', `2026-02-0${i + 1}`))
    const r = buildSpendingSummary(rows, CATS, [acct('a')], '2026-02')
    expect(r.totalOut).toBe(1)
  })
})
