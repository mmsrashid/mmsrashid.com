import { reconcileAccount } from '@/lib/money/reconcile'
import type { MoneyBalance } from '@/lib/money/types'
import type { MoneyTransaction } from '@/lib/money/spending-types'

const bal = (as_of: string, balance: number): MoneyBalance => ({
  id: as_of, user_id: 'u', account_id: 'a', as_of, balance,
  source: 'manual', document_id: null, notes: null, created_at: `${as_of}T00:00:00Z`,
})

const txn = (txn_date: string, amount: number): MoneyTransaction => ({
  id: `${txn_date}-${amount}`, user_id: 'u', account_id: 'a', txn_date,
  description: 'x', merchant: null, amount, category_id: null, category_source: null,
  document_id: null, external_id: null, dedupe_key: `${txn_date}-${amount}`,
  notes: null, created_at: `${txn_date}T00:00:00Z`,
})

describe('reconcileAccount', () => {
  it('returns no intervals when there is only one snapshot', () => {
    expect(reconcileAccount([bal('2026-01-31', 100)], [])).toEqual([])
  })

  it('returns no intervals when there are no snapshots', () => {
    expect(reconcileAccount([], [txn('2026-02-01', -10)])).toEqual([])
  })

  it('passes when transactions explain the balance change', () => {
    const r = reconcileAccount(
      [bal('2026-01-31', 1000), bal('2026-02-28', 900)],
      [txn('2026-02-10', -60), txn('2026-02-20', -40)],
    )
    expect(r).toHaveLength(1)
    expect(r[0].ok).toBe(true)
    expect(r[0].unexplained).toBe(0)
  })

  it('flags unrecorded money out as a negative gap', () => {
    // The balance fell 100 but only 60 of spending was imported, so 40 left the
    // account unrecorded — most often a missed statement page.
    const r = reconcileAccount(
      [bal('2026-01-31', 1000), bal('2026-02-28', 900)],
      [txn('2026-02-10', -60)],
    )
    expect(r[0].ok).toBe(false)
    expect(r[0].unexplained).toBe(-40)
  })

  it('tolerates a discrepancy under a penny', () => {
    const r = reconcileAccount(
      [bal('2026-01-31', 1000), bal('2026-02-28', 999.995)],
      [txn('2026-02-10', -0.005)],
    )
    expect(r[0].ok).toBe(true)
  })

  it('excludes the opening snapshot date and includes the closing one', () => {
    // A transaction dated on the opening snapshot day is already reflected in
    // that balance, so counting it again would invent a discrepancy.
    const r = reconcileAccount(
      [bal('2026-01-31', 1000), bal('2026-02-28', 900)],
      [txn('2026-01-31', -999), txn('2026-02-28', -100)],
    )
    expect(r[0].ok).toBe(true)
  })

  it('handles money in as well as out', () => {
    const r = reconcileAccount(
      [bal('2026-01-31', 1000), bal('2026-02-28', 1500)],
      [txn('2026-02-10', 500)],
    )
    expect(r[0].ok).toBe(true)
  })

  it('reports one interval per consecutive snapshot pair', () => {
    const r = reconcileAccount(
      [bal('2026-01-31', 100), bal('2026-02-28', 100), bal('2026-03-31', 100)],
      [],
    )
    expect(r).toHaveLength(2)
  })

  it('flags more recorded spending than the balance change allows', () => {
    // The balance did not move, yet 40 of spending was recorded, so 40 must have
    // arrived unrecorded.
    const r = reconcileAccount(
      [bal('2026-01-31', 1000), bal('2026-02-28', 1000)],
      [txn('2026-02-10', -40)],
    )
    expect(r[0].ok).toBe(false)
    expect(r[0].unexplained).toBe(40)
  })

  it('sorts unordered snapshots before comparing', () => {
    const r = reconcileAccount(
      [bal('2026-02-28', 900), bal('2026-01-31', 1000)],
      [txn('2026-02-10', -100)],
    )
    expect(r[0]).toMatchObject({ from: '2026-01-31', to: '2026-02-28', ok: true })
  })
})
