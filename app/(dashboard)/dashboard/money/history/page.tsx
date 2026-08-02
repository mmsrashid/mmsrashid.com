'use client'
import { useCallback, useEffect, useState } from 'react'
import type { MoneyAccount, MoneyBalance } from '@/lib/money/types'

const money = (n: number, ccy = 'GBP') =>
  n.toLocaleString('en-GB', { style: 'currency', currency: ccy, maximumFractionDigits: 2 })

export default function MoneyHistoryPage() {
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [balances, setBalances] = useState<MoneyBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => Promise.all([
    fetch('/api/money/accounts').then(r => r.json()),
    fetch('/api/money/balances').then(r => r.json()),
  ]).then(([a, b]) => {
    setAccounts(Array.isArray(a) ? a : [])
    setBalances(Array.isArray(b) ? b : [])
    setLoading(false)
  }), [])

  useEffect(() => { void load() }, [load])

  async function remove(id: string) {
    if (!confirm('Delete this balance snapshot?')) return
    const res = await fetch(`/api/money/balances/${id}`, { method: 'DELETE' })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not delete.')
    await load()
  }

  if (loading) return <div style={{ padding: 40, fontSize: 12, color: '#9ca3af' }}>Loading…</div>
  if (balances.length === 0) return (
    <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: '#6b7280' }}>
      No balance snapshots yet.
    </div>
  )

  const nameOf = (id: string) => accounts.find(a => a.id === id)?.name ?? 'Unknown account'
  const ccyOf = (id: string) => accounts.find(a => a.id === id)?.currency ?? 'GBP'
  const rows = [...balances].sort((a, b) => b.as_of.localeCompare(a.as_of))

  const cell: React.CSSProperties = { padding: '9px 14px', borderBottom: '1px solid #f9fafb', fontSize: 12 }

  return (
    <div style={{ padding: '20px 22px' }}>
      {error && <p style={{ fontSize: 12, color: '#991b1b', marginBottom: 10 }}>{error}</p>}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Date', 'Account', 'Balance', 'Source', ''].map(h => (
                <th key={h} style={{
                  textAlign: h === 'Balance' ? 'right' : 'left', padding: '8px 14px',
                  background: '#fafafa', color: '#9ca3af', fontWeight: 600, fontSize: 11,
                  borderBottom: '1px solid #f3f4f6',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(b => (
              <tr key={b.id}>
                <td style={cell}>{b.as_of}</td>
                <td style={{ ...cell, fontWeight: 600 }}>{nameOf(b.account_id)}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{money(Number(b.balance), ccyOf(b.account_id))}</td>
                <td style={{ ...cell, color: '#9ca3af' }}>{b.source}</td>
                <td style={cell}>
                  <button onClick={() => remove(b.id)}
                    style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '3px 8px', fontSize: 10, color: '#dc2626', cursor: 'pointer' }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
