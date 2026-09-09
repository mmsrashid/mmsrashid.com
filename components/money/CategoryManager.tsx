'use client'
import { useState } from 'react'
import {
  CATEGORY_KINDS, type CategoryKind, type MoneyCategory,
} from '@/lib/money/spending-types'
import { PROPERTY_TREATMENTS, type PropertyTreatment } from '@/lib/money/property-types'

type WithTreatment = MoneyCategory & { property_treatment?: PropertyTreatment | null }

/**
 * Add, rename and remove categories.
 *
 * The API has supported this since the categories were built, but there was no
 * interface for it — so the seeded list was effectively fixed and a missing
 * category could not be added at all.
 *
 * The group shown is "Personal" for kind 'spending'. The stored kind keeps its
 * original name because every spending total keys off it; only the label here
 * differs.
 */
const GROUP_LABEL: Record<CategoryKind, string> = {
  spending: 'Personal',
  income: 'Income',
  transfer: 'Transfer',
}

export default function CategoryManager({
  categories,
  onChanged,
}: {
  categories: WithTreatment[]
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<CategoryKind>('spending')
  const [treatment, setTreatment] = useState<'' | PropertyTreatment>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const input: React.CSSProperties = {
    border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', fontSize: 12,
  }

  async function add() {
    setBusy(true); setError(''); setNotice('')
    try {
      const res = await fetch('/api/money/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, kind,
          property_treatment: treatment || null,
          // After the seeded set, so a new category lands at the end of its group.
          sort_order: 200,
        }),
      })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not add that category.')
      setNotice(`Added "${d.name}".`)
      setName(''); setTreatment('')
      onChanged()
    } finally { setBusy(false) }
  }

  async function rename(id: string) {
    setBusy(true); setError(''); setNotice('')
    try {
      const res = await fetch(`/api/money/categories/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not rename.')
      setRenaming(null)
      onChanged()
    } finally { setBusy(false) }
  }

  async function remove(c: WithTreatment) {
    // Transactions survive with their category cleared, and rules pointing at it
    // are removed. Worth saying, because "delete" reads as more destructive than
    // it is — and less destructive than it is for the rules.
    if (!confirm(
      `Delete category "${c.name}"?\n\n` +
      `Transactions keep their history but become uncategorised, and any rule ` +
      `pointing at this category is deleted too.`,
    )) return

    setBusy(true); setError(''); setNotice('')
    try {
      const res = await fetch(`/api/money/categories/${c.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not delete.')
      setNotice(
        `Deleted "${c.name}".` +
        (d.transactions_uncategorised
          ? ` ${d.transactions_uncategorised} transaction(s) are now uncategorised.`
          : ''),
      )
      onChanged()
    } finally { setBusy(false) }
  }

  const grouped: [string, WithTreatment[]][] = [
    ['Property', categories.filter(c => c.property_treatment)],
    ['Personal', categories.filter(c => !c.property_treatment && c.kind === 'spending')],
    ['Income', categories.filter(c => !c.property_treatment && c.kind === 'income')],
    ['Transfers', categories.filter(c => !c.property_treatment && c.kind === 'transfer')],
  ]

  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
      padding: '14px 18px', marginBottom: 16,
    }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          border: 'none', background: 'none', padding: 0, cursor: 'pointer',
          fontSize: 13, fontWeight: 700,
        }}>
        {open ? '▾' : '▸'} Manage categories ({categories.length})
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {error && <p style={{ fontSize: 12, color: '#991b1b', marginBottom: 8 }}>{error}</p>}
          {notice && <p style={{ fontSize: 12, color: '#065f46', marginBottom: 8 }}>{notice}</p>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <input style={{ ...input, minWidth: 160 }} placeholder="New category, e.g. Car insurance"
              value={name} onChange={e => setName(e.target.value)} />
            <select style={input} value={kind}
              onChange={e => setKind(e.target.value as CategoryKind)}>
              {CATEGORY_KINDS.map(k => (
                <option key={k} value={k}>{GROUP_LABEL[k]}</option>
              ))}
            </select>
            <select style={input} value={treatment}
              onChange={e => setTreatment(e.target.value as '' | PropertyTreatment)}>
              <option value="">Not a property category</option>
              {PROPERTY_TREATMENTS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={add} disabled={busy || !name.trim()}
              style={{ ...input, background: '#111', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              Add
            </button>
          </div>

          {grouped.map(([label, items]) => items.length === 0 ? null : (
            <div key={label} style={{ marginBottom: 12 }}>
              <p style={{
                fontSize: 10, fontWeight: 700, color: '#9ca3af',
                textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4,
              }}>{label}</p>
              {items.map(c => (
                <div key={c.id} style={{
                  display: 'flex', gap: 6, alignItems: 'center',
                  padding: '4px 0', borderBottom: '1px solid #f9fafb',
                }}>
                  {renaming === c.id ? (
                    <>
                      <input style={{ ...input, flex: 1, fontSize: 11, padding: '3px 6px' }}
                        value={newName} onChange={e => setNewName(e.target.value)} />
                      <button onClick={() => rename(c.id)} disabled={busy || !newName.trim()}
                        style={{ ...input, fontSize: 10, padding: '3px 8px', background: '#111', color: '#fff', cursor: 'pointer' }}>
                        Save
                      </button>
                      <button onClick={() => setRenaming(null)}
                        style={{ ...input, fontSize: 10, padding: '3px 8px', background: '#fff', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: 12 }}>{c.name}</span>
                      {c.property_treatment && (
                        <span style={{ fontSize: 9, color: '#9ca3af' }}>{c.property_treatment}</span>
                      )}
                      <button onClick={() => { setRenaming(c.id); setNewName(c.name) }}
                        style={{ border: 'none', background: 'none', fontSize: 10, color: '#3b82f6', cursor: 'pointer' }}>
                        rename
                      </button>
                      <button onClick={() => remove(c)} disabled={busy}
                        style={{ border: 'none', background: 'none', fontSize: 10, color: '#dc2626', cursor: 'pointer' }}>
                        delete
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
