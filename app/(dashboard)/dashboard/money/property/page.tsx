'use client'
import { useCallback, useEffect, useState } from 'react'
import PropertyPLTable from '@/components/money/PropertyPLTable'
import type { PropertyPL } from '@/lib/money/property-pl'
import { latestTaxYearWithActivity } from '@/lib/money/property-pl'
import {
  LOCATION_KINDS, LOCATION_KIND_LABEL, type LocationKind, type MoneyProperty,
} from '@/lib/money/property-types'

/** Tax years run 6 April to 5 April, so the label is a straddling pair. */
function taxYearOptions(count = 6): string[] {
  const now = new Date()
  // Before 6 April we are still in the year that started the previous April.
  const startYear = (now.getMonth() > 3 || (now.getMonth() === 3 && now.getDate() >= 6))
    ? now.getFullYear()
    : now.getFullYear() - 1
  return Array.from({ length: count }, (_, i) => {
    const y = startYear - i
    return `${y}/${String((y + 1) % 100).padStart(2, '0')}`
  })
}

export default function PropertyPage() {
  const years = taxYearOptions()
  const [taxYear, setTaxYear] = useState(years[0])
  const [yearPicked, setYearPicked] = useState(false)
  const [pl, setPl] = useState<PropertyPL | null>(null)
  const [properties, setProperties] = useState<MoneyProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [kind, setKind] = useState<LocationKind>('property')
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [share, setShare] = useState('100')

  const [editing, setEditing] = useState<string | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [editShare, setEditShare] = useState('100')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const load = useCallback((year: string) => Promise.all([
    fetch(`/api/money/property-pl?tax_year=${encodeURIComponent(year)}`).then(r => r.json()),
    fetch('/api/money/properties').then(r => r.json()),
  ]).then(([p, props]) => {
    if (p?.error) setError(p.error)
    else setPl(p)
    setProperties(Array.isArray(props) ? props : [])
    setLoading(false)
  }), [])

  useEffect(() => { void load(taxYear) }, [load, taxYear])

  // Open on the most recent tax year that actually has property activity.
  //
  // Defaulting to the current tax year showed a table of zeros whenever the
  // latest statement was from an earlier year, which reads as "no data" rather
  // than "not this year". Runs once, and only moves the selector if that year
  // is one of the offered options, so it can never select something unreachable.
  useEffect(() => {
    if (yearPicked) return
    let cancelled = false
    fetch('/api/money/transactions')
      .then(r => r.json())
      .then((rows: { txn_date: string; property_id?: string | null }[]) => {
        if (cancelled || !Array.isArray(rows)) return
        const latest = latestTaxYearWithActivity(rows)
        setYearPicked(true)
        if (latest && years.includes(latest)) setTaxYear(latest)
      })
      .catch(() => setYearPicked(true))
    return () => { cancelled = true }
  }, [yearPicked, years])

  async function addProperty() {
    setError('')
    const res = await fetch('/api/money/properties', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code, label, kind,
        // Share is an ownership fraction. It means nothing for a person, and
        // the API ignores it for anything but a property.
        share_percent: kind === 'property' ? Number(share) || 100 : 100,
      }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not add that property.')
    setCode(''); setLabel(''); setShare('100'); setKind('property')
    await load(taxYear)
  }

  function startEdit(p: MoneyProperty) {
    setEditing(p.id)
    setEditCode(p.code)
    setEditLabel(p.label ?? '')
    setEditShare(String(p.share_percent))
    setNotice('')
  }

  async function saveEdit(id: string) {
    setBusy(id); setError(''); setNotice('')
    try {
      const res = await fetch(`/api/money/properties/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: editCode, label: editLabel, share_percent: Number(editShare) || 100,
        }),
      })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not update.')
      setEditing(null)
      await load(taxYear)
    } finally { setBusy(null) }
  }

  async function setSold(p: MoneyProperty, sold: boolean) {
    setBusy(p.id); setError(''); setNotice('')
    try {
      const res = await fetch(`/api/money/properties/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: sold ? 'sold' : 'active' }),
      })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not update.')
      await load(taxYear)
    } finally { setBusy(null) }
  }

  async function removeProperty(p: MoneyProperty) {
    // Marking it sold is usually right for a property no longer owned, because
    // that keeps its history in earlier tax years. Deleting is for a row that
    // should never have existed.
    const warning = [
      `Delete property "${p.code}"?`,
      '',
      'Its transactions are kept but lose their property tag, and any rules pointing at it are removed.',
      '',
      'If you simply sold it, use "Sold" instead — that keeps it in earlier years.',
    ].join('\n')
    if (!confirm(warning)) return

    setBusy(p.id); setError(''); setNotice('')
    try {
      const res = await fetch(`/api/money/properties/${p.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not delete.')
      setNotice(
        `Deleted ${p.code}.` +
        (d.transactions_untagged
          ? ` ${d.transactions_untagged} transaction(s) kept but untagged.`
          : ''),
      )
      await load(taxYear)
    } finally { setBusy(null) }
  }

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
    padding: '14px 18px', marginBottom: 16,
  }
  const input: React.CSSProperties = {
    border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', fontSize: 12,
  }

  if (loading) return <div style={{ padding: 40, fontSize: 12, color: '#9ca3af' }}>Loading…</div>

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <select value={taxYear} onChange={e => setTaxYear(e.target.value)} style={input}>
          {years.map(y => <option key={y} value={y}>{`${y} tax year`}</option>)}
        </select>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>6 April to 5 April</span>
      </div>

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

      {pl?.currencyWarning && (
        <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a' }}>
          <p style={{ fontSize: 12, color: '#92400e' }}>{pl.currencyWarning}</p>
        </div>
      )}

      {pl && pl.untaggedCount > 0 && (
        <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a' }}>
          <p style={{ fontSize: 12, color: '#92400e' }}>
            <strong>{pl.untaggedCount}</strong> property transaction
            {pl.untaggedCount === 1 ? '' : 's'} worth{' '}
            <strong>
              {pl.untaggedValue.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}
            </strong>{' '}
            {pl.untaggedCount === 1 ? 'is' : 'are'} not assigned to a property, so the figures below
            are incomplete. Assign them in the Transactions tab.
          </p>
        </div>
      )}

      {properties.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 30 }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>🏘️</div>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>No properties yet</p>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Add one below using the code you refer to it by.
          </p>
        </div>
      ) : (
        <div style={card}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
            Profit and loss by property
          </h3>
          {pl && <PropertyPLTable pl={pl} taxYear={taxYear} />}
        </div>
      )}

      {properties.length > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Locations</h3>
          <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 10 }}>
            A transaction has a category and a location. A location can be a property or a person
            — only properties appear in the P&amp;L above, and a payment tagged to a person stays
            in your personal book.
          </p>
          {/* Sorted by kind then code, with the kind shown on each row. Group
              headings were tried and read worse: the badge is already on the
              row, so the heading only repeated it. */}
          {[...properties]
            .sort((a, b) => {
              const ka = LOCATION_KINDS.indexOf(a.kind ?? 'property')
              const kb = LOCATION_KINDS.indexOf(b.kind ?? 'property')
              return ka - kb || a.code.localeCompare(b.code)
            })
            .map(p => (
            <div key={p.id} style={{ padding: '9px 0', borderBottom: '1px solid #f9fafb' }}>
              {editing === p.id ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input style={{ ...input, width: 100 }} value={editCode}
                    onChange={e => setEditCode(e.target.value)} placeholder="Code" />
                  <input style={{ ...input, flex: 1, minWidth: 160 }} value={editLabel}
                    onChange={e => setEditLabel(e.target.value)} placeholder="Address or label" />
                  <input style={{ ...input, width: 90 }} value={editShare}
                    onChange={e => setEditShare(e.target.value)} placeholder="Share %" />
                  <button onClick={() => saveEdit(p.id)} disabled={busy === p.id}
                    style={{ ...input, background: '#111', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                    Save
                  </button>
                  <button onClick={() => setEditing(null)}
                    style={{ ...input, background: '#fff', cursor: 'pointer' }}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 170 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>
                      {p.code}
                      <span style={{
                        fontSize: 9, fontWeight: 600, marginLeft: 6, padding: '1px 5px',
                        borderRadius: 4, color: '#6b7280', background: '#f3f4f6',
                      }}>{LOCATION_KIND_LABEL[p.kind ?? 'property']}</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>
                      {p.label ? `${p.label} · ` : ''}
                      {(p.kind ?? 'property') === 'property'
                        ? (p.share_percent < 100 ? `${p.share_percent}% share` : 'sole owner')
                        : 'personal book'}
                      {p.status === 'sold' ? ` · sold ${p.disposed_date ?? ''}` : ''}
                    </div>
                  </div>
                  <button onClick={() => startEdit(p)}
                    style={{ ...input, background: '#fff', cursor: 'pointer' }}>Edit</button>
                  {p.status === 'active' ? (
                    <button onClick={() => setSold(p, true)} disabled={busy === p.id}
                      title="Keeps it in earlier tax years"
                      style={{ ...input, background: '#fff', cursor: 'pointer' }}>Sold</button>
                  ) : (
                    <button onClick={() => setSold(p, false)} disabled={busy === p.id}
                      style={{ ...input, background: '#fff', cursor: 'pointer' }}>Reopen</button>
                  )}
                  <button onClick={() => removeProperty(p)} disabled={busy === p.id}
                    style={{ ...input, background: '#fff', color: '#dc2626', cursor: 'pointer' }}>Delete</button>
                </div>
              )}
            </div>
          ))}
          <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>
            Got the label wrong? Use Edit — no need to delete and re-add.
          </p>
        </div>
      )}

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Add a location</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={{ ...input, width: 110 }} value={kind}
            onChange={e => setKind(e.target.value as LocationKind)}>
            {LOCATION_KINDS.map(k => (
              <option key={k} value={k}>{LOCATION_KIND_LABEL[k]}</option>
            ))}
          </select>
          <input style={{ ...input, width: 140 }}
            placeholder={kind === 'property' ? 'Code, e.g. 4FLH' : 'Name'}
            value={code} onChange={e => setCode(e.target.value)} />
          <input style={input}
            placeholder={kind === 'property' ? 'Address or label (optional)' : 'Note (optional)'}
            value={label} onChange={e => setLabel(e.target.value)} />
          {/* Share is hidden for a person: it is an ownership fraction and has
              no meaning for one, so offering the field would invite a value
              that silently does nothing. */}
          {kind === 'property' && (
            <input style={{ ...input, width: 110 }} placeholder="Share %"
              value={share} onChange={e => setShare(e.target.value)} />
          )}
          <button onClick={addProperty} disabled={!code.trim()}
            style={{ ...input, background: '#111', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            Add
          </button>
        </div>
        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>
          {kind === 'property'
            ? 'Share matters for jointly held property — at 50% every figure reports your half.'
            : 'A person is a location for attributing your own spending. It stays in the personal book and never appears in the property P&L.'}
        </p>
      </div>

      <p style={{ fontSize: 10, color: '#9ca3af', lineHeight: 1.7 }}>
        These are calculations from your own records, not tax advice. Mortgage interest is excluded
        from taxable profit under Section 24 and shown as a 20% reducer instead. That reducer is
        capped at 20% of property profits here, but the statutory test also caps it against your
        adjusted total income, which this app cannot see — so treat it as an upper bound and check
        before filing anything.
      </p>
    </div>
  )
}
