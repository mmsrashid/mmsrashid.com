'use client'
import { useEffect, useMemo, useState } from 'react'
import SpendingByCategory from '@/components/money/SpendingByCategory'
import CategoryTrend, { type TrendPoint } from '@/components/money/CategoryTrend'
import CategoryManager from '@/components/money/CategoryManager'
import { buildPersonalPL, isPersonalRow, treatmentMap } from '@/lib/money/personal-book'
import type { MoneyCategory, MoneyTransaction } from '@/lib/money/spending-types'
import type { MoneyAccount } from '@/lib/money/types'

const money = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 })

const thisMonth = () => new Date().toISOString().slice(0, 7)

export default function PersonalPage() {
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
      const rows: MoneyTransaction[] = Array.isArray(t) ? t : []
      setTxns(rows)
      setCats(Array.isArray(c) ? c : [])
      setAccounts(Array.isArray(a) ? a : [])
      // Open on the most recent month that has PERSONAL activity.
      //
      // Defaulting to the calendar month shows a page of zeros whenever the
      // latest statement is behind. Defaulting to the latest month of ANY
      // activity had the same effect on this page once the books were split:
      // the newest month held only property transactions, so the personal book
      // opened empty and looked broken.
      const treatments = treatmentMap(Array.isArray(c) ? c : [])
      const personalMonths = rows
        .filter(r => isPersonalRow(r, treatments))
        .map(r => r.txn_date.slice(0, 7))
        .sort()
      const latest = personalMonths.pop() ?? rows.map(r => r.txn_date.slice(0, 7)).sort().pop()
      if (latest) setMonth(latest)
      setLoading(false)
    })
  }, [])

  const reloadCategories = () =>
    fetch('/api/money/categories').then(r => r.json())
      .then(c => setCats(Array.isArray(c) ? c : []))

  const months = useMemo(
    () => [...new Set(txns.map(t => t.txn_date.slice(0, 7)))].sort().reverse(),
    [txns],
  )

  const pl = useMemo(
    () => buildPersonalPL(txns, cats, accounts, month),
    [txns, cats, accounts, month],
  )
  const summary = pl.month

  const trend: TrendPoint[] = useMemo(
    () => [...months].reverse().slice(-12).map(m => ({
      month: m,
      // Personal only, like the cards above it. Using the combined figure here
      // would draw a chart that disagrees with the total beside it.
      total: buildPersonalPL(txns, cats, accounts, m).month.totalOut,
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
      <div style={{ marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800 }}>Personal P&amp;L</h2>
        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
          Your own money only. Anything tagged to a property is kept out and reported on the{' '}
          <strong>Property</strong> tab — the two are separate books.
        </p>
      </div>

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
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
          tax year {pl.taxYear}
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
          <div style={{
            fontSize: 21, fontWeight: 800,
            color: summary.net < 0 ? '#dc2626' : '#111',
          }}>{money(summary.net)}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Net</div>
        </div>
      </div>

      {/* Year to date, to the end of the month being viewed — not to today, so
          looking at an earlier month shows the year as it stood then. */}
      <div style={{ ...card, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af',
            textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Tax year to date
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>
            {pl.taxYearPeriod.from} → {pl.taxYearPeriod.to}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#dc2626' }}>
            {money(pl.yearToDate.totalOut)}
          </div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>Out</div>
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#059669' }}>
            {money(pl.yearToDate.totalIn)}
          </div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>In</div>
        </div>
        <div>
          <div style={{
            fontSize: 17, fontWeight: 800,
            color: pl.yearToDate.net < 0 ? '#dc2626' : '#111',
          }}>{money(pl.yearToDate.net)}</div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>Net</div>
        </div>
      </div>

      {pl.heldForReviewCount > 0 && (
        <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a' }}>
          <p style={{ fontSize: 12, color: '#92400e' }}>
            <strong>{pl.heldForReviewCount}</strong> transaction
            {pl.heldForReviewCount === 1 ? '' : 's'} worth{' '}
            <strong>{money(Math.abs(pl.heldForReviewValue))}</strong> have a property category but
            no property assigned, so {pl.heldForReviewCount === 1 ? 'it is' : 'they are'} in
            neither book. Tag {pl.heldForReviewCount === 1 ? 'it' : 'them'} on the Transactions tab
            — sort by Property and the blanks sit at the bottom.
          </p>
        </div>
      )}

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
          {pl.propertyRowCount > 0 && ` ${pl.propertyRowCount} property-tagged transaction${
            pl.propertyRowCount === 1 ? '' : 's'} excluded — see the Property tab.`}
        </p>
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Spending by month</h3>
        <CategoryTrend points={trend} />
      </div>

      <CategoryManager categories={cats} onChanged={reloadCategories} />
    </div>
  )
}
