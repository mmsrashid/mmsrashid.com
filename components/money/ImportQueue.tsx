'use client'
import type { MoneyAccount } from '@/lib/money/types'

export interface StagedFile {
  id: string
  file: File
  accountId: string
  status: 'waiting' | 'importing' | 'done' | 'failed'
  summary?: string
}

/**
 * Files waiting to be imported, each with its own account.
 *
 * One statement per account is the normal case: a Starling feed names no account
 * at all and a Barclays one names only its sort code, so the account cannot be
 * inferred reliably for every file. Staging them makes the pairing explicit
 * before anything is written, rather than discovering mid-import that a file
 * could not be placed.
 */
export default function ImportQueue({
  staged,
  accounts,
  busy,
  onSetAccount,
  onRemove,
  onImport,
  onClear,
}: {
  staged: StagedFile[]
  accounts: MoneyAccount[]
  busy: boolean
  onSetAccount: (id: string, accountId: string) => void
  onRemove: (id: string) => void
  onImport: () => void
  onClear: () => void
}) {
  if (staged.length === 0) return null

  const ready = staged.filter(s => s.status === 'waiting' && s.accountId)
  const unassigned = staged.filter(s => s.status === 'waiting' && !s.accountId)
  const finished = staged.filter(s => s.status === 'done' || s.status === 'failed')

  const box: React.CSSProperties = {
    background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10,
    padding: 10, marginBottom: 8,
  }
  const sel: React.CSSProperties = {
    width: '100%', border: '1px solid #d1d5db', borderRadius: 6,
    padding: '3px 6px', fontSize: 10, marginTop: 3,
  }

  const tint = (s: StagedFile) =>
    s.status === 'done' ? '#059669'
      : s.status === 'failed' ? '#dc2626'
        : s.status === 'importing' ? '#2563eb' : '#6b7280'

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, flex: 1 }}>
          {staged.length} file{staged.length === 1 ? '' : 's'} to import
        </span>
        {!busy && (
          <button onClick={onClear}
            style={{ border: 'none', background: 'none', fontSize: 10, color: '#6b7280', cursor: 'pointer' }}>
            clear
          </button>
        )}
      </div>

      {staged.map(s => (
        <div key={s.id} style={{ marginBottom: 7, paddingBottom: 7, borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
            <span style={{
              flex: 1, fontSize: 10, color: tint(s),
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {s.status === 'importing' ? '⏳ ' : s.status === 'done' ? '✓ ' : s.status === 'failed' ? '✕ ' : ''}
              {s.file.name}
            </span>
            {s.status === 'waiting' && !busy && (
              <button onClick={() => onRemove(s.id)}
                style={{ border: 'none', background: 'none', fontSize: 10, color: '#9ca3af', cursor: 'pointer' }}>
                ✕
              </button>
            )}
          </div>

          {s.status === 'waiting' && (
            <select
              value={s.accountId}
              onChange={e => onSetAccount(s.id, e.target.value)}
              disabled={busy}
              style={{ ...sel, borderColor: s.accountId ? '#d1d5db' : '#fbbf24' }}
            >
              <option value="">— which account? —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}

          {s.summary && (
            <div style={{ fontSize: 10, color: tint(s), marginTop: 3, lineHeight: 1.5 }}>
              {s.summary}
            </div>
          )}
        </div>
      ))}

      {unassigned.length > 0 && !busy && (
        <p style={{ fontSize: 10, color: '#92400e', marginBottom: 6 }}>
          {unassigned.length} file{unassigned.length === 1 ? '' : 's'} still need an account.
        </p>
      )}

      {ready.length > 0 && (
        <button
          onClick={onImport}
          disabled={busy}
          style={{
            width: '100%', background: busy ? '#9ca3af' : '#111', color: '#fff',
            border: 'none', borderRadius: 8, padding: '6px 10px',
            fontSize: 11, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Importing…' : `Import ${ready.length} file${ready.length === 1 ? '' : 's'}`}
        </button>
      )}

      {busy && (
        <p style={{ fontSize: 10, color: '#6b7280', marginTop: 5 }}>
          One at a time, so two files for the same account cannot both think a
          transaction is new.
        </p>
      )}

      {!busy && finished.length === staged.length && (
        <p style={{ fontSize: 10, color: '#6b7280', marginTop: 5 }}>
          All done. Clear the list when you have read the results.
        </p>
      )}
    </div>
  )
}
