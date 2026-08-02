import { buildNetWorthSeries } from '@/lib/money/net-worth'
import type { MoneyAccount, MoneyBalance } from '@/lib/money/types'

const acct = (over: Partial<MoneyAccount> & { id: string }): MoneyAccount => ({
  user_id: 'u', name: over.id, institution: null, kind: 'savings',
  currency: 'GBP', opened_date: null, closed_date: null, status: 'active',
  notes: null, created_at: '2025-01-01T00:00:00Z', ...over,
})

const bal = (account_id: string, as_of: string, balance: number): MoneyBalance => ({
  id: `${account_id}-${as_of}`, user_id: 'u', account_id, as_of, balance,
  source: 'manual', document_id: null, notes: null,
  created_at: `${as_of}T00:00:00Z`,
})

describe('buildNetWorthSeries', () => {
  it('returns an empty series when there are no balances', () => {
    const r = buildNetWorthSeries([acct({ id: 'a' })], [])
    expect(r.points).toEqual([])
    expect(r.currencyWarning).toBeNull()
  })

  it('sums a single account on a single date', () => {
    const r = buildNetWorthSeries([acct({ id: 'a' })], [bal('a', '2025-01-31', 1000)])
    expect(r.points).toHaveLength(1)
    expect(r.points[0]).toMatchObject({
      date: '2025-01-31', assets: 1000, liabilities: 0, net: 1000,
      accountsCounted: 1, accountsTotal: 1,
    })
  })

  it('subtracts liabilities instead of adding them', () => {
    const r = buildNetWorthSeries(
      [acct({ id: 'a', kind: 'savings' }), acct({ id: 'm', kind: 'mortgage' })],
      [bal('a', '2025-01-31', 50_000), bal('m', '2025-01-31', 200_000)],
    )
    expect(r.points[0]).toMatchObject({ assets: 50_000, liabilities: 200_000, net: -150_000 })
  })

  it('does NOT count an account before its first snapshot', () => {
    // The pension appears in March. January must not treat it as zero, which
    // would draw a fake step-change in net worth.
    const r = buildNetWorthSeries(
      [acct({ id: 'a' }), acct({ id: 'p', kind: 'pension' })],
      [bal('a', '2025-01-31', 1000), bal('p', '2025-03-31', 20_000)],
    )
    expect(r.points[0]).toMatchObject({ date: '2025-01-31', net: 1000, accountsCounted: 1 })
    expect(r.points[1]).toMatchObject({ date: '2025-03-31', net: 21_000, accountsCounted: 2 })
    expect(r.points[0].accountsTotal).toBe(2)
  })

  it('carries the last known balance forward', () => {
    const r = buildNetWorthSeries(
      [acct({ id: 'a' }), acct({ id: 'b' })],
      [bal('a', '2025-01-31', 1000), bal('b', '2025-01-31', 500), bal('b', '2025-02-28', 700)],
    )
    // 'a' has no February reading, so January's 1000 still counts.
    expect(r.points[1]).toMatchObject({ date: '2025-02-28', net: 1700, accountsCounted: 2 })
  })

  it('drops a closed account after its closed_date but keeps earlier history', () => {
    const r = buildNetWorthSeries(
      [acct({ id: 'a' }), acct({ id: 'z', status: 'closed', closed_date: '2025-02-01' })],
      [bal('a', '2025-01-31', 1000), bal('z', '2025-01-31', 300), bal('a', '2025-03-31', 1100)],
    )
    expect(r.points[0]).toMatchObject({ date: '2025-01-31', net: 1300, accountsCounted: 2 })
    expect(r.points[1]).toMatchObject({ date: '2025-03-31', net: 1100, accountsCounted: 1 })
  })

  it('resolves two balances on one date to the newest written', () => {
    const older = { ...bal('a', '2025-01-31', 1000), created_at: '2025-02-01T10:00:00Z' }
    const newer = { ...bal('a', '2025-01-31', 1234), created_at: '2025-02-02T10:00:00Z' }
    const r = buildNetWorthSeries([acct({ id: 'a' })], [older, newer])
    expect(r.points).toHaveLength(1)
    expect(r.points[0].net).toBe(1234)
  })

  it('refuses to sum mixed currencies and warns instead', () => {
    const r = buildNetWorthSeries(
      [acct({ id: 'a', currency: 'GBP' }), acct({ id: 'u', currency: 'USD' })],
      [bal('a', '2025-01-31', 1000), bal('u', '2025-01-31', 1000)],
    )
    expect(r.currencyWarning).toMatch(/GBP/)
    expect(r.currencyWarning).toMatch(/USD/)
    expect(r.points).toEqual([])
  })

  it('ignores balances belonging to an unknown account', () => {
    const r = buildNetWorthSeries([acct({ id: 'a' })], [bal('ghost', '2025-01-31', 999)])
    expect(r.points).toEqual([])
  })

  it('does not drift when summing pence-level amounts', () => {
    // 0.10 is not representable in binary floating point; naive repeated
    // addition of ten of them lands on 0.9999999999999999.
    const accounts = Array.from({ length: 10 }, (_, i) => acct({ id: `a${i}` }))
    const balances = accounts.map(a => bal(a.id, '2025-01-31', 0.1))
    const r = buildNetWorthSeries(accounts, balances)
    expect(r.points[0].net).toBe(1)
  })
})
