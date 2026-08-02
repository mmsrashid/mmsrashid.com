'use client'
import { useEffect, useState } from 'react'
import type { ExtractedBalance, MoneyAccount } from '@/lib/money/types'

interface Props {
  rows: ExtractedBalance[]
  documentId: string | null
  onDone: (savedCount: number) => void
}

/**
 * Confirms balances the extractor was unsure about, or could not match to an
 * account. Each row must be given an account and a date before it can be saved;
 * a guessed balance would corrupt every later figure in the net worth series.
 */
export default function PendingReview({ rows, documentId, onDone }: Props) {
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [draft, setDraft] = useState(rows.map(r => ({
    account_id: r.account_id ?? '',
    as_of: r.as_of ?? '',
    balance: String(r.balance),
    name: r.account_name,
    skip: false,
  })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/money/accounts').then(r => r.json())
      .then(d => setAccounts(Array.isArray(d) ? d.filter((a: MoneyAccount) => a.status === 'active') : []))
  }, [])

  const set = (i: number, patch: Partial<typeof draft[number]>) =>
    setDraft(d => d.map((row, n) => (n === i ? { ...row, ...patch } : row)))

  async function save() {
    setSaving(true); setError('')
    let saved = 0
    try {
      for (const row of draft) {
        if (row.skip || !row.account_id || !row.as_of) continue
        const res = await fetch('/api/money/balances', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account_id: row.account_id, as_of: row.as_of,
            balance: row.balance, source: 'document', document_id: documentId,
          }),
        })
        if (res.ok) saved++
        else setError((await res.json()).error || 'One row could not be saved.')
      }
      onDone(saved)
    } finally { setSaving(false) }
  }

  const input: React.CSSProperties = {
    border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 6px', fontSize: 11, width: '100%',
  }

  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 10, marginBottom: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
        Needs your check — I wasn&apos;t confident about these
      </p>
      {draft.map((row, i) => (
        <div key={i} style={{ marginBottom: 8, opacity: row.skip ? 0.45 : 1 }}>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>
            read as &ldquo;{row.name}&rdquo;
          </div>
          <select style={input} value={row.account_id} onChange={e => set(i, { account_id: e.target.value })}>
            <option value="">— choose an account —</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
            <input style={input} type="date" value={row.as_of} onChange={e => set(i, { as_of: e.target.value })} />
            <input style={input} value={row.balance} onChange={e => set(i, { balance: e.target.value })} />
          </div>
          <label style={{ fontSize: 10, color: '#6b7280', display: 'flex', gap: 4, marginTop: 3 }}>
            <input type="checkbox" checked={row.skip} onChange={e => set(i, { skip: e.target.checked })} />
            discard this one
          </label>
        </div>
      ))}
      {error && <p style={{ fontSize: 10, color: '#991b1b', marginBottom: 4 }}>{error}</p>}
      <button onClick={save} disabled={saving}
        style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
        {saving ? 'Saving…' : 'Save these'}
      </button>
    </div>
  )
}
