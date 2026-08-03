'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MoneyCategory, MoneyTransaction } from '@/lib/money/spending-types'
import type { MoneyAccount } from '@/lib/money/types'

const money = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 })

export default function TransactionsPage() {
  const [txns, setTxns] = useState<MoneyTransaction[]>([])
  const [cats, setCats] = useState<MoneyCategory[]>([])
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [search, setSearch] = useState('')
  const [onlyUncategorised, setOnlyUncategorised] = useState(false)
  const [accountFilter, setAccountFilter] = useState('')

  const load = useCallback(() => Promise.all([
    fetch('/api/money/transactions').then(r => r.json()),
    fetch('/api/money/categories').then(r => r.json()),
    fetch('/api/money/accounts').then(r => r.json()),
  ]).then(([t, c, a]) => {
    setTxns(Array.isArray(t) ? t : [])
    setCats(Array.isArray(c) ? c : [])
    setAccounts(Array.isArray(a) ? a : [])
    setLoading(false)
  }), [])

  useEffect(() => { void load() }, [load])

  async function setCategory(t: MoneyTransaction, categoryId: string) {
    setError('')
    const res = await fetch(`/api/money/transactions/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: categoryId || null }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not update.')
    setTxns(prev => prev.map(x => (x.id === t.id ? d : x)))
  }

  /** Turns one correction into a rule, so the same merchant is right next time. */
  async function createRule(t: MoneyTransaction) {
    if (!t.category_id) return setError('Give it a category first, then create the rule.')
    const suggested = t.description.split(/\s{2,}|,/)[0].trim().slice(0, 40)
    const pattern = prompt(
      'Any transaction whose description contains this text will get that category:',
      suggested,
    )
    if (!pattern) return

    const res = await fetch('/api/money/rules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern, match_type: 'contains', category_id: t.category_id }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not create the rule.')

    const re = await fetch('/api/money/transactions/recategorise', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ only_uncategorised: true }),
    })
    const rd = await re.json()
    setNotice(
      `Rule saved. ${rd.changed ?? 0} transaction(s) recategorised, ` +
      `${rd.still_uncategorised ?? 0} still uncategorised.`,
    )
    await load()
  }

  const filtered = useMemo(() => txns.filter(t => {
    if (onlyUncategorised && t.category_id) return false
    if (accountFilter && t.account_id !== accountFilter) return false
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [txns, onlyUncategorised, accountFilter, search])

  if (loading) return <div style={{ padding: 40, fontSize: 12, color: '#9ca3af' }}>Loading…</div>
  if (txns.length === 0) return (
    <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: '#6b7280' }}>
      No transactions yet. Drop a statement into JARVIS.
    </div>
  )

  const input: React.CSSProperties = {
    border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', fontSize: 12,
  }
  const cell: React.CSSProperties = {
    padding: '8px 12px', borderBottom: '1px solid #f9fafb', fontSize: 12,
  }
  const nameOf = (id: string) => accounts.find(a => a.id === id)?.name ?? '—'

  return (
    <div style={{ padding: '20px 22px' }}>
      {error && <p style={{ fontSize: 12, color: '#991b1b', marginBottom: 8 }}>{error}</p>}
      {notice && <p style={{ fontSize: 12, color: '#065f46', marginBottom: 8 }}>{notice}</p>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={input} placeholder="Search description…" value={search}
          onChange={e => setSearch(e.target.value)} />
        <select style={input} value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label style={{ fontSize: 11, color: '#6b7280', display: 'flex', gap: 5, alignItems: 'center' }}>
          <input type="checkbox" checked={onlyUncategorised}
            onChange={e => setOnlyUncategorised(e.target.checked)} />
          uncategorised only
        </label>
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
          {filtered.length} of {txns.length}
        </span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Date', 'Description', 'Account', 'Amount', 'Category', ''].map(h => (
                <th key={h} style={{
                  textAlign: h === 'Amount' ? 'right' : 'left', padding: '8px 12px',
                  background: '#fafafa', color: '#9ca3af', fontWeight: 600, fontSize: 11,
                  borderBottom: '1px solid #f3f4f6',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map(t => (
              <tr key={t.id}>
                <td style={cell}>{t.txn_date}</td>
                <td style={{
                  ...cell, maxWidth: 320, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {t.description}
                </td>
                <td style={{ ...cell, color: '#9ca3af' }}>{nameOf(t.account_id)}</td>
                <td style={{
                  ...cell, textAlign: 'right', fontWeight: 600,
                  color: Number(t.amount) < 0 ? '#111' : '#059669',
                }}>
                  {money(Number(t.amount))}
                </td>
                <td style={cell}>
                  <select
                    value={t.category_id ?? ''}
                    onChange={e => setCategory(t, e.target.value)}
                    style={{
                      ...input, padding: '3px 6px', fontSize: 11,
                      borderColor: t.category_id ? '#d1d5db' : '#fbbf24',
                    }}
                  >
                    <option value="">— uncategorised —</option>
                    {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {t.category_source && (
                    <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 4 }}>
                      {t.category_source}
                    </span>
                  )}
                </td>
                <td style={cell}>
                  <button onClick={() => createRule(t)}
                    title="Apply this category to similar descriptions from now on"
                    style={{ ...input, padding: '3px 7px', fontSize: 10, cursor: 'pointer', background: '#fff' }}>
                    Rule
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 500 && (
        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>
          Showing the first 500 of {filtered.length}. Narrow the filters to see the rest — nothing has
          been deleted.
        </p>
      )}
    </div>
  )
}
