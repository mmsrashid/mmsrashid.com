'use client'
import { useEffect, useState } from 'react'
import { reconcileAccount } from '@/lib/money/reconcile'
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABEL, type AccountKind, type MoneyAccount, type MoneyBalance } from '@/lib/money/types'
import type { MoneyTransaction } from '@/lib/money/spending-types'
import { localToday } from '@/lib/local-date'

export default function MoneyAccountsPage() {
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [balances, setBalances] = useState<MoneyBalance[]>([])
  const [txns, setTxns] = useState<MoneyTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [institution, setInstitution] = useState('')
  const [kind, setKind] = useState<AccountKind>('current')

  const [balanceFor, setBalanceFor] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [asOf, setAsOf] = useState(localToday())

  const load = () => Promise.all([
    fetch('/api/money/accounts').then(r => r.json()),
    fetch('/api/money/balances').then(r => r.json()),
    fetch('/api/money/transactions').then(r => r.json()),
  ]).then(([a, b, t]) => {
    setAccounts(Array.isArray(a) ? a : [])
    setBalances(Array.isArray(b) ? b : [])
    setTxns(Array.isArray(t) ? t : [])
    setLoading(false)
  })

  useEffect(() => { void load() }, [])

  async function addAccount() {
    setError(''); setNotice('')
    const res = await fetch('/api/money/accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, institution, kind }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not add that account.')
    setName(''); setInstitution('')
    await load()
  }

  async function setStatus(a: MoneyAccount, status: 'active' | 'closed') {
    setBusy(a.id); setError(''); setNotice('')
    try {
      const res = await fetch(`/api/money/accounts/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not update.')
      await load()
    } finally { setBusy(null) }
  }

  async function remove(a: MoneyAccount) {
    // Deleting cascades the balance history; closing keeps it. Say so.
    if (!confirm(
      `Delete "${a.name}" and its entire balance history?\n\n` +
      `If the account simply closed, use Close instead — that keeps the history in your net worth trend.`
    )) return
    setBusy(a.id); setError('')
    try {
      const res = await fetch(`/api/money/accounts/${a.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not delete.')
      await load()
    } finally { setBusy(null) }
  }

  async function addBalance(accountId: string) {
    setError(''); setNotice('')
    const res = await fetch('/api/money/balances', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId, as_of: asOf, balance: amount, source: 'manual' }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not save that balance.')
    setAmount(''); setBalanceFor(null)
    setNotice(`Balance saved for ${asOf}. See it in Overview.`)
  }

  if (loading) return <div style={{ padding: 40, fontSize: 12, color: '#9ca3af' }}>Loading…</div>

  const input: React.CSSProperties = {
    border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', fontSize: 12,
  }
  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16,
  }

  return (
    <div style={{ padding: '20px 22px' }}>
      {error && (
        <div style={{ ...card, background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b', fontSize: 12 }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ ...card, background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46', fontSize: 12 }}>
          {notice}
        </div>
      )}

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Add an account</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={input} placeholder="Name, e.g. Barclays Current" value={name} onChange={e => setName(e.target.value)} />
          <input style={input} placeholder="Institution" value={institution} onChange={e => setInstitution(e.target.value)} />
          <select style={input} value={kind} onChange={e => setKind(e.target.value as AccountKind)}>
            {ACCOUNT_KINDS.map(k => <option key={k} value={k}>{ACCOUNT_KIND_LABEL[k]}</option>)}
          </select>
          <button onClick={addAccount} disabled={!name.trim()}
            style={{ ...input, background: '#111', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            Add
          </button>
        </div>
        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>
          Enter debts as they appear on the statement — a £250,000 mortgage is 250000, not negative.
        </p>
      </div>

      {(['active', 'closed'] as const).map(status => {
        const items = accounts.filter(a => a.status === status)
        return (
          <div key={status} style={card}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: 'capitalize' }}>{status}</h3>
            {items.length === 0
              ? <p style={{ fontSize: 11, color: '#9ca3af' }}>None.</p>
              : items.map(a => (
                <div key={a.id} style={{ padding: '9px 0', borderBottom: '1px solid #f9fafb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af' }}>
                        {ACCOUNT_KIND_LABEL[a.kind]}{a.institution ? ` · ${a.institution}` : ''} · {a.currency}
                        {a.closed_date ? ` · closed ${a.closed_date}` : ''}
                      </div>
                    </div>
                    <button onClick={() => setBalanceFor(balanceFor === a.id ? null : a.id)}
                      style={{ ...input, cursor: 'pointer', background: '#fff' }}>
                      Balance
                    </button>
                    {status === 'active'
                      ? <button onClick={() => setStatus(a, 'closed')} disabled={busy === a.id}
                          title="Keeps the balance history" style={{ ...input, cursor: 'pointer', background: '#fff' }}>Close</button>
                      : <button onClick={() => setStatus(a, 'active')} disabled={busy === a.id}
                          style={{ ...input, cursor: 'pointer', background: '#fff' }}>Reopen</button>}
                    <button onClick={() => remove(a)} disabled={busy === a.id}
                      style={{ ...input, cursor: 'pointer', background: '#fff', color: '#dc2626' }}>Delete</button>
                  </div>
                  {balanceFor === a.id && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input style={input} type="date" value={asOf} onChange={e => setAsOf(e.target.value)} />
                      <input style={input} placeholder="Balance" value={amount} onChange={e => setAmount(e.target.value)} />
                      <button onClick={() => addBalance(a.id)} disabled={!amount.trim()}
                        style={{ ...input, background: '#111', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                        Save
                      </button>
                    </div>
                  )}
                  {(() => {
                    // Only mismatches are shown. A clean interval needs no
                    // commentary, and a line per healthy one would bury the gap
                    // that matters.
                    const gbp = (n: number) =>
                      n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
                    const bad = reconcileAccount(
                      balances.filter(b => b.account_id === a.id),
                      txns.filter(t => t.account_id === a.id),
                    ).filter(i => !i.ok)
                    if (bad.length === 0) return null
                    return (
                      <div style={{
                        marginTop: 6, padding: '6px 8px', background: '#fffbeb',
                        border: '1px solid #fde68a', borderRadius: 6,
                        fontSize: 10, color: '#92400e', lineHeight: 1.6,
                      }}>
                        {bad.map(i => (
                          <div key={`${i.from}-${i.to}`}>
                            {i.from} to {i.to}: the balance moved {gbp(i.balanceChange)} but recorded
                            transactions total {gbp(i.transactionSum)} — {gbp(Math.abs(i.unexplained))}{' '}
                            {i.unexplained < 0
                              ? 'appears to have left the account unrecorded.'
                              : 'arrived that no transaction accounts for.'}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              ))}
          </div>
        )
      })}
    </div>
  )
}
