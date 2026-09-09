'use client'
import { useMemo, useState } from 'react'
import CategoryPicker from './CategoryPicker'
import type { MoneyCategory, MoneyCategoryRule } from '@/lib/money/spending-types'
import type { MoneyProperty } from '@/lib/money/property-types'

/**
 * Lists the categorisation rules, with edit and delete.
 *
 * There was no interface for this at all — rules could only be created, from
 * the Rule button, and never seen again. 26 accumulated unnoticed in real use,
 * six of them duplicates of another rule's pattern, and a duplicate that
 * disagreed with its twin about the property made the newer rule look as though
 * it had not saved. A list the user can actually read is the thing that would
 * have made that obvious.
 */
export default function RulesManager({
  rules, categories, properties, onChanged,
}: {
  rules: MoneyCategoryRule[]
  categories: MoneyCategory[]
  properties: MoneyProperty[]
  onChanged: () => Promise<void> | void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const catName = (id: string | null) =>
    (id && categories.find(c => c.id === id)?.name) || '—'

  const sorted = useMemo(
    () => [...rules].sort((a, b) =>
      a.priority - b.priority || a.pattern.toLowerCase().localeCompare(b.pattern.toLowerCase())),
    [rules],
  )

  // A pattern appearing twice is worth flagging: which copy wins is no longer
  // obvious from reading the list, and the two often disagree.
  const duplicated = useMemo(() => {
    const seen = new Map<string, number>()
    for (const r of rules) {
      const k = `${r.pattern.toLowerCase()}|${r.match_type}`
      seen.set(k, (seen.get(k) ?? 0) + 1)
    }
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k))
  }, [rules])

  const isDupe = (r: MoneyCategoryRule) =>
    duplicated.has(`${r.pattern.toLowerCase()}|${r.match_type}`)

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true); setError(''); setNotice('')
    try {
      const res = await fetch(`/api/money/rules/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not update the rule.')
      await onChanged()
      setNotice('Rule updated. Re-run "Categorise" to apply it to existing rows.')
    } finally { setBusy(false) }
  }

  async function remove(r: MoneyCategoryRule) {
    // Says what survives. Deleting a rule does not undo its past work: the
    // transactions it categorised keep their category until something re-runs.
    if (!confirm(
      `Delete the rule for "${r.pattern}"?\n\n` +
      `Transactions it already categorised keep their category — this only stops ` +
      `the rule applying from now on.`,
    )) return

    setBusy(true); setError(''); setNotice('')
    try {
      const res = await fetch(`/api/money/rules/${r.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not delete the rule.')
      await onChanged()
      setNotice(`Deleted the rule for "${r.pattern}".`)
    } finally { setBusy(false) }
  }

  const input: React.CSSProperties = {
    border: '1px solid #d1d5db', borderRadius: 8, padding: '3px 6px', fontSize: 11,
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
      padding: '14px 18px', marginTop: 16,
    }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          border: 'none', background: 'none', padding: 0, cursor: 'pointer',
          fontSize: 13, fontWeight: 700,
        }}>
        {open ? '▾' : '▸'} Rules ({rules.length})
        {duplicated.size > 0 && (
          <span style={{ color: '#b45309', fontWeight: 600, marginLeft: 8, fontSize: 11 }}>
            {duplicated.size} duplicated pattern{duplicated.size === 1 ? '' : 's'}
          </span>
        )}
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {error && <p style={{ fontSize: 12, color: '#991b1b', marginBottom: 8 }}>{error}</p>}
          {notice && <p style={{ fontSize: 12, color: '#065f46', marginBottom: 8 }}>{notice}</p>}

          {duplicated.size > 0 && (
            <div style={{
              background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
              padding: '8px 10px', marginBottom: 10,
            }}>
              <p style={{ fontSize: 11, color: '#92400e' }}>
                The highlighted rules share a pattern with another rule. The one that also sets a
                property now wins, but keeping only one of each is clearer — delete the copies you
                don&apos;t want.
              </p>
            </div>
          )}

          {rules.length === 0 && (
            <p style={{ fontSize: 12, color: '#6b7280' }}>
              No rules yet. Categorise a transaction and press <strong>Rule</strong> to make one.
            </p>
          )}

          {sorted.map(r => (
            <div key={r.id} style={{
              display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
              padding: '6px 8px', marginBottom: 4, borderRadius: 8,
              background: isDupe(r) ? '#fffbeb' : 'transparent',
              border: `1px solid ${isDupe(r) ? '#fde68a' : '#f9fafb'}`,
            }}>
              <code style={{
                fontSize: 11, background: '#f3f4f6', borderRadius: 4, padding: '2px 5px',
                maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{r.pattern}</code>
              <span style={{ fontSize: 9, color: '#9ca3af' }}>{r.match_type}</span>

              <span style={{ fontSize: 11, color: '#6b7280' }}>→</span>
              <CategoryPicker
                categories={categories}
                value={r.category_id ?? ''}
                onChange={id => patch(r.id, { category_id: id || null })}
              />

              {properties.length > 0 && (
                <select
                  value={r.property_id ?? ''}
                  disabled={busy}
                  onChange={e => patch(r.id, { property_id: e.target.value || null })}
                  title="Property this rule assigns"
                  style={input}
                >
                  <option value="">no property</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.code}</option>
                  ))}
                </select>
              )}

              <input
                type="number"
                value={r.priority}
                disabled={busy}
                onChange={e => patch(r.id, { priority: Number(e.target.value) })}
                title="Lower numbers are checked first"
                style={{ ...input, width: 58 }}
              />

              <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto' }}>
                {catName(r.category_id)}
              </span>
              <button onClick={() => remove(r)} disabled={busy}
                style={{ border: 'none', background: 'none', fontSize: 10, color: '#dc2626', cursor: 'pointer' }}>
                delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
