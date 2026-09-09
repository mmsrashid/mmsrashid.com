'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { PropertyDetail } from '@/lib/money/property-detail'

const gbp = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 })

/** Tax years run 6 April to 5 April, so the label is a straddling pair. */
function taxYearOptions(count = 6): string[] {
  const now = new Date()
  const startYear = (now.getMonth() > 3 || (now.getMonth() === 3 && now.getDate() >= 6))
    ? now.getFullYear()
    : now.getFullYear() - 1
  return Array.from({ length: count }, (_, i) => {
    const y = startYear - i
    return `${y}/${String((y + 1) % 100).padStart(2, '0')}`
  })
}

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  // Memoised: a fresh array each render would re-run the effect below on
  // every render, snapping the selector back to the URL year each time the
  // user chose a different one.
  const years = useMemo(() => taxYearOptions(), [])

  const [taxYear, setTaxYear] = useState(years[0])
  const [yearFromUrl, setYearFromUrl] = useState(false)
  const [d, setD] = useState<PropertyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // The year arrives in the URL so a click from the portfolio keeps its period.
  //
  // Read in an effect, not in the useState initializer: this component is
  // server-rendered first, where window does not exist, so the initializer
  // always chose the default and hydration never revisited it — the link
  // carried 2024/25 and the page showed 2026/27.
  useEffect(() => {
    // Once only. After this the selector owns the year.
    if (yearFromUrl) return
    const q = new URLSearchParams(window.location.search).get('tax_year')
    if (q && years.includes(q)) setTaxYear(q)
    setYearFromUrl(true)
  }, [years, yearFromUrl])

  const load = useCallback((year: string) => {
    setLoading(true)
    return fetch(`/api/money/property-pl/${id}?tax_year=${encodeURIComponent(year)}`)
      .then(r => r.json())
      .then(res => {
        if (res?.error) setError(res.error)
        else { setD(res); setError('') }
        setLoading(false)
      })
      .catch(() => { setError('Could not load this property.'); setLoading(false) })
  }, [id])

  // Held until the URL has been read, so the first request is for the year
  // actually asked for rather than the default followed by a second fetch.
  useEffect(() => {
    if (yearFromUrl) void load(taxYear)
  }, [load, taxYear, yearFromUrl])

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
    padding: '14px 18px', marginBottom: 16,
  }
  const input: React.CSSProperties = {
    border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', fontSize: 12,
  }

  if (loading && !d) return <div style={{ padding: 40, fontSize: 12, color: '#9ca3af' }}>Loading…</div>
  if (error) return (
    <div style={{ padding: 40 }}>
      <p style={{ fontSize: 12, color: '#991b1b', marginBottom: 10 }}>{error}</p>
      <button onClick={() => router.push('/dashboard/money/property')} style={input}>
        ← All properties
      </button>
    </div>
  )
  if (!d) return null

  const r = d.row
  const figures: [string, number, string?][] = [
    ['Rent received', r.rentReceived],
    ['Allowable expenses', r.allowableExpenses],
    ['Mortgage interest', r.mortgageInterest],
    ['Cash profit', r.cashProfit, 'what actually hit the bank'],
    ['Taxable profit', r.taxableProfit, 'interest excluded — Section 24'],
    ['20% reducer', r.interestTaxReducer, r.reducerCapped ? 'capped by profit' : undefined],
  ]

  return (
    <div style={{ padding: '20px 22px' }}>
      <button onClick={() => router.push('/dashboard/money/property')}
        style={{ ...input, background: '#fff', cursor: 'pointer', marginBottom: 12 }}>
        ← All properties
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 800 }}>{d.property.code}</h2>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
            {d.property.label || 'No address recorded'}
            {d.property.share_percent !== 100 && ` · ${d.property.share_percent}% share`}
            {d.property.disposed_date && ` · sold ${d.property.disposed_date}`}
          </p>
        </div>
        <select value={taxYear} onChange={e => setTaxYear(e.target.value)}
          style={{ ...input, marginLeft: 'auto' }}>
          {years.map(y => <option key={y} value={y}>{y} tax year</option>)}
        </select>
      </div>

      <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>
        {d.period.from} → {d.period.to}
        {d.property.share_percent !== 100 &&
          ' · every figure and line below is your share'}
      </p>

      {d.currencyWarning && (
        <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a' }}>
          <p style={{ fontSize: 12, color: '#92400e' }}>{d.currencyWarning}</p>
        </div>
      )}

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 12, marginBottom: 16,
      }}>
        {figures.map(([label, value, note]) => (
          <div key={label} style={{ ...card, marginBottom: 0 }}>
            <div style={{
              fontSize: 19, fontWeight: 800,
              color: label === 'Cash profit' && value < 0 ? '#dc2626'
                : label === 'Rent received' ? '#059669' : '#111',
            }}>{gbp(value)}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
            {note && <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{note}</div>}
          </div>
        ))}
      </div>

      {r.cashProfit < 0 && r.taxableProfit > 0 && (
        <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a' }}>
          <p style={{ fontSize: 12, color: '#92400e' }}>
            This property lost <strong>{gbp(Math.abs(r.cashProfit))}</strong> in cash terms but has
            a taxable profit of <strong>{gbp(r.taxableProfit)}</strong>, because mortgage interest
            is not deductible for a personally-held property. The {gbp(r.interestTaxReducer)}{' '}
            reducer offsets some of the tax, not the loss.
          </p>
        </div>
      )}

      {r.unclassifiedCount > 0 && (
        <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a' }}>
          <p style={{ fontSize: 12, color: '#92400e' }}>
            <strong>{r.unclassifiedCount}</strong> transaction
            {r.unclassifiedCount === 1 ? '' : 's'} worth{' '}
            <strong>{gbp(Math.abs(r.unclassifiedValue))}</strong>{' '}
            {r.unclassifiedCount === 1 ? 'is' : 'are'} tagged to this property but sit in a
            category with no property treatment, so {r.unclassifiedCount === 1 ? 'it is' : 'they are'}{' '}
            in none of the figures above. They are listed under
            <strong> Tagged but unclassified</strong> below.
          </p>
        </div>
      )}

      {d.byMonth.length > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>By month</h3>
          <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 10 }}>
            A month with no rent has no row — that is how a missed payment shows up.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Month', 'Rent', 'Expenses', 'Net'].map(h => (
                  <th key={h} style={{
                    textAlign: h === 'Month' ? 'left' : 'right', padding: '6px 8px',
                    background: '#fafafa', color: '#9ca3af', fontWeight: 600, fontSize: 11,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.byMonth.map(m => (
                <tr key={m.month}>
                  <td style={{ padding: '6px 8px', fontSize: 12, borderBottom: '1px solid #f9fafb' }}>
                    {m.month}
                  </td>
                  <td style={{ padding: '6px 8px', fontSize: 12, textAlign: 'right', color: '#059669', borderBottom: '1px solid #f9fafb' }}>
                    {m.rent ? gbp(m.rent) : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', fontSize: 12, textAlign: 'right', borderBottom: '1px solid #f9fafb' }}>
                    {m.expenses ? gbp(m.expenses) : '—'}
                  </td>
                  <td style={{
                    padding: '6px 8px', fontSize: 12, textAlign: 'right', fontWeight: 600,
                    color: m.rent - m.expenses < 0 ? '#dc2626' : '#111',
                    borderBottom: '1px solid #f9fafb',
                  }}>
                    {gbp(m.rent - m.expenses)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {d.groups.length === 0 ? (
        <div style={{ ...card, textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            Nothing tagged to {d.property.code} in {taxYear}
          </p>
          <p style={{ fontSize: 11, color: '#6b7280' }}>
            Tag transactions to this property on the Transactions tab, or pick another tax year.
          </p>
        </div>
      ) : d.groups.map(g => (
        <div key={g.treatment} style={card}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700 }}>{g.label}</h3>
            <span style={{ fontSize: 10, color: '#9ca3af' }}>
              {g.lines.length} transaction{g.lines.length === 1 ? '' : 's'}
            </span>
            <strong style={{ fontSize: 13, marginLeft: 'auto' }}>{gbp(g.total)}</strong>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {g.lines.map(l => (
                <tr key={l.id}>
                  <td style={{ padding: '5px 8px', fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap', borderBottom: '1px solid #f9fafb' }}>
                    {l.date}
                  </td>
                  <td style={{
                    padding: '5px 8px', fontSize: 11, maxWidth: 300,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    borderBottom: '1px solid #f9fafb',
                  }}>{l.description}</td>
                  <td style={{ padding: '5px 8px', fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap', borderBottom: '1px solid #f9fafb' }}>
                    {l.categoryName}
                  </td>
                  <td style={{ padding: '5px 8px', fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap', borderBottom: '1px solid #f9fafb' }}>
                    {l.accountName}
                  </td>
                  <td style={{
                    padding: '5px 8px', fontSize: 11, textAlign: 'right', fontWeight: 600,
                    whiteSpace: 'nowrap', borderBottom: '1px solid #f9fafb',
                    color: l.amount < 0 ? '#111' : '#059669',
                  }}>{gbp(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <p style={{ fontSize: 10, color: '#9ca3af', lineHeight: 1.5 }}>
        Arithmetic from your own records, not tax advice. Mortgage interest is excluded from
        taxable profit under Section 24 and shown as a 20% reducer instead. That reducer is capped
        at 20% of property profits here, but the statutory test also caps it against your adjusted
        total income, which this app cannot see — treat it as an upper bound.
      </p>
    </div>
  )
}
