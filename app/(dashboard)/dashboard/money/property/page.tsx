'use client'
import { useCallback, useEffect, useState } from 'react'
import PropertyPLTable from '@/components/money/PropertyPLTable'
import type { PropertyPL } from '@/lib/money/property-pl'
import type { MoneyProperty } from '@/lib/money/property-types'

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
  const [pl, setPl] = useState<PropertyPL | null>(null)
  const [properties, setProperties] = useState<MoneyProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [share, setShare] = useState('100')

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

  async function addProperty() {
    setError('')
    const res = await fetch('/api/money/properties', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, label, share_percent: Number(share) || 100 }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not add that property.')
    setCode(''); setLabel(''); setShare('100')
    await load(taxYear)
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
          {pl && <PropertyPLTable pl={pl} />}
        </div>
      )}

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Add a property</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...input, width: 110 }} placeholder="Code, e.g. 4FLH"
            value={code} onChange={e => setCode(e.target.value)} />
          <input style={input} placeholder="Address or label (optional)"
            value={label} onChange={e => setLabel(e.target.value)} />
          <input style={{ ...input, width: 110 }} placeholder="Share %"
            value={share} onChange={e => setShare(e.target.value)} />
          <button onClick={addProperty} disabled={!code.trim()}
            style={{ ...input, background: '#111', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            Add
          </button>
        </div>
        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>
          Share matters for jointly held property — at 50% every figure reports your half.
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
