'use client'
import { useEffect, useState } from 'react'
import NetWorthTrend from '@/components/money/NetWorthTrend'
import { buildNetWorthSeries, latestNetWorth } from '@/lib/money/net-worth'
import { ACCOUNT_KIND_LABEL, isLiability, type MoneyAccount, type MoneyBalance } from '@/lib/money/types'

const money = (n: number, ccy = 'GBP') =>
  n.toLocaleString('en-GB', { style: 'currency', currency: ccy, maximumFractionDigits: 2 })

export default function MoneyOverviewPage() {
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [balances, setBalances] = useState<MoneyBalance[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/money/accounts').then(r => r.json()),
      fetch('/api/money/balances').then(r => r.json()),
    ]).then(([a, b]) => {
      setAccounts(Array.isArray(a) ? a : [])
      setBalances(Array.isArray(b) ? b : [])
      setLoading(false)
    })
  }, [])

  if (loading) return <div style={{ padding: 40, fontSize: 12, color: '#9ca3af' }}>Loading…</div>

  if (accounts.length === 0) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🏦</div>
      <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>No accounts yet</p>
      <p style={{ fontSize: 12, color: '#6b7280' }}>Add one in the Accounts tab to start tracking net worth.</p>
    </div>
  )

  const series = buildNetWorthSeries(accounts, balances)
  const latest = latestNetWorth(series)

  // Latest known balance per account, for the account cards.
  const latestFor = (id: string) => {
    const rows = balances.filter(b => b.account_id === id)
    if (rows.length === 0) return null
    return rows.reduce((a, b) => (a.as_of >= b.as_of ? a : b))
  }

  const live = accounts.filter(a => a.status === 'active')
  const assets = live.filter(a => !isLiability(a.kind))
  const debts = live.filter(a => isLiability(a.kind))

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px',
  }

  const Group = ({ title, items }: { title: string; items: MoneyAccount[] }) => (
    <div style={{ ...card, marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{title}</h3>
      {items.length === 0
        ? <p style={{ fontSize: 11, color: '#9ca3af' }}>None recorded.</p>
        : items.map(a => {
            const b = latestFor(a.id)
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid #f9fafb' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{a.name}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>
                    {ACCOUNT_KIND_LABEL[a.kind]}{a.institution ? ` · ${a.institution}` : ''}
                    {b ? ` · as of ${b.as_of}` : ' · no balance yet'}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {b ? money(Number(b.balance), a.currency) : '—'}
                </div>
              </div>
            )
          })}
    </div>
  )

  return (
    <div style={{ padding: '20px 22px' }}>
      {series.currencyWarning && (
        <div style={{ ...card, marginBottom: 16, background: '#fffbeb', borderColor: '#fde68a' }}>
          <p style={{ fontSize: 12, color: '#92400e' }}>{series.currencyWarning}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{latest ? money(latest.net) : '—'}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Net worth</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#059669' }}>{latest ? money(latest.assets) : '—'}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Assets</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626' }}>{latest ? money(latest.liabilities) : '—'}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Debts</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {latest ? `${latest.accountsCounted}/${latest.accountsTotal}` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Accounts counted</div>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Net worth over time</h3>
        <NetWorthTrend points={series.points} />
      </div>

      <Group title="Assets" items={assets} />
      <Group title="Debts" items={debts} />
    </div>
  )
}
