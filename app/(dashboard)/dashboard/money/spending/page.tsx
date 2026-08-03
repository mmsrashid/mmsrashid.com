'use client'
import { useEffect, useMemo, useState } from 'react'
import SpendingByCategory from '@/components/money/SpendingByCategory'
import CategoryTrend, { type TrendPoint } from '@/components/money/CategoryTrend'
import { buildSpendingSummary } from '@/lib/money/spending-summary'
import type { MoneyCategory, MoneyTransaction } from '@/lib/money/spending-types'
import type { MoneyAccount } from '@/lib/money/types'

const money = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 })

const thisMonth = () => new Date().toISOString().slice(0, 7)

export default function SpendingPage() {
  const [txns, setTxns] = useState<MoneyTransaction[]>([])
  const [cats, setCats] = useState<MoneyCategory[]>([])
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [month, setMonth] = useState(thisMonth())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/money/transactions').then(r => r.json()),
      fetch('/api/money/categories').then(r => r.json()),
      fetch('/api/money/accounts').then(r => r.json()),
    ]).then(([t, c, a]) => {
      setTxns(Array.isArray(t) ? t : [])
      setCats(Array.isArray(c) ? c : [])
      setAccounts(Array.isArray(a) ? a : [])
      setLoading(false)
    })
  }, [])

  const months = useMemo(
    () => [...new Set(txns.map(t => t.txn_date.slice(0, 7)))].sort().reverse(),
    [txns],
  )

  const summary = useMemo(
    () => buildSpendingSummary(txns, cats, accounts, month),
    [txns, cats, accounts, month],
  )

  const trend: TrendPoint[] = useMemo(
    () => [...months].reverse().slice(-12).map(m => ({
      month: m,
      total: buildSpendingSummary(txns, cats, accounts, m).totalOut,
    })),
    [months, txns, cats, accounts],
  )

  if (loading) return <div style={{ padding: 40, fontSize: 12, color: '#9ca3af' }}>Loading…</div>

  if (txns.length === 0) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🧾</div>
      <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>No transactions yet</p>
      <p style={{ fontSize: 12, color: '#6b7280' }}>
        Drop a bank statement PDF or CSV into JARVIS and I&apos;ll file it.
      </p>
    </div>
  )

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
    padding: '14px 18px', marginBottom: 16,
  }

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <select value={month} onChange={e => setMonth(e.target.value)}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
          {(months.includes(month) ? months : [month, ...months]).map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>
          {summary.transactionCount} transaction{summary.transactionCount === 1 ? '' : 's'}
        </span>
      </div>

      {summary.currencyWarning && (
        <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a' }}>
          <p style={{ fontSize: 12, color: '#92400e' }}>{summary.currencyWarning}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontSize: 21, fontWeight: 800, color: '#dc2626' }}>{money(summary.totalOut)}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Out</div>
        </div>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontSize: 21, fontWeight: 800, color: '#059669' }}>{money(summary.totalIn)}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>In</div>
        </div>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontSize: 21, fontWeight: 800 }}>{money(summary.net)}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Net</div>
        </div>
      </div>

      {summary.uncategorisedCount > 0 && (
        <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a' }}>
          <p style={{ fontSize: 12, color: '#92400e' }}>
            <strong>{summary.uncategorisedCount}</strong> transaction
            {summary.uncategorisedCount === 1 ? '' : 's'} worth{' '}
            <strong>{money(summary.uncategorisedValue)}</strong> aren&apos;t categorised yet, so the
            breakdown below is incomplete. Categorise them in the Transactions tab.
          </p>
        </div>
      )}

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Where it went</h3>
        <SpendingByCategory rows={summary.byCategory} />
        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 10 }}>
          Transfers between your own accounts are excluded from both totals.
        </p>
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Spending by month</h3>
        <CategoryTrend points={trend} />
      </div>
    </div>
  )
}
