'use client'
import type { PropertyPL } from '@/lib/money/property-pl'

const gbp = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 })

/**
 * Per-property P&L, with cash and taxable profit side by side.
 *
 * Both are always shown and always labelled. They differ because mortgage
 * interest is a real cash cost that is not deductible against rental income, and
 * showing only one would be confidently wrong for whichever purpose the reader
 * actually had.
 */
export default function PropertyPLTable({ pl }: { pl: PropertyPL }) {
  if (pl.perProperty.length === 0) {
    return <p style={{ fontSize: 12, color: '#9ca3af' }}>No properties on record yet.</p>
  }

  const th: React.CSSProperties = {
    padding: '8px 10px', background: '#fafafa', color: '#9ca3af',
    fontWeight: 600, fontSize: 11, borderBottom: '1px solid #f3f4f6', textAlign: 'right',
  }
  const td: React.CSSProperties = {
    padding: '9px 10px', borderBottom: '1px solid #f9fafb', fontSize: 12, textAlign: 'right',
  }
  const profit = (n: number): React.CSSProperties => ({
    ...td, fontWeight: 700, color: n < 0 ? '#dc2626' : '#111',
  })

  const t = pl.totals

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Property</th>
            <th style={th}>Rent</th>
            <th style={th}>Allowable</th>
            <th style={th}>Interest</th>
            <th style={th}>Cash profit</th>
            <th style={th}>Taxable profit</th>
            <th style={th}>20% reducer</th>
          </tr>
        </thead>
        <tbody>
          {pl.perProperty.map(r => (
            <tr key={r.propertyId}>
              <td style={{ ...td, textAlign: 'left' }}>
                <div style={{ fontWeight: 700 }}>{r.code}</div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>
                  {r.label ? `${r.label} · ` : ''}
                  {r.sharePercent < 100 ? `${r.sharePercent}% share` : 'sole owner'}
                  {r.unclassifiedCount > 0
                    ? ` · ${r.unclassifiedCount} unclassified (${gbp(r.unclassifiedValue)})`
                    : ''}
                </div>
              </td>
              <td style={td}>{gbp(r.rentReceived)}</td>
              <td style={td}>{gbp(r.allowableExpenses)}</td>
              <td style={td}>{gbp(r.mortgageInterest)}</td>
              <td style={profit(r.cashProfit)}>{gbp(r.cashProfit)}</td>
              <td style={profit(r.taxableProfit)}>{gbp(r.taxableProfit)}</td>
              <td style={td}>
                {gbp(r.interestTaxReducer)}
                {r.reducerCapped && (
                  <div style={{ fontSize: 9, color: '#92400e' }}>capped by profit</div>
                )}
              </td>
            </tr>
          ))}
          <tr style={{ background: '#fafafa' }}>
            <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>Portfolio</td>
            <td style={{ ...td, fontWeight: 700 }}>{gbp(t.rentReceived)}</td>
            <td style={{ ...td, fontWeight: 700 }}>{gbp(t.allowableExpenses)}</td>
            <td style={{ ...td, fontWeight: 700 }}>{gbp(t.mortgageInterest)}</td>
            <td style={profit(t.cashProfit)}>{gbp(t.cashProfit)}</td>
            <td style={profit(t.taxableProfit)}>{gbp(t.taxableProfit)}</td>
            <td style={{ ...td, fontWeight: 700 }}>{gbp(t.interestTaxReducer)}</td>
          </tr>
        </tbody>
      </table>

      {t.capitalSpend > 0 && (
        <p style={{ fontSize: 10, color: '#6b7280', marginTop: 10, lineHeight: 1.6 }}>
          <strong>{gbp(t.capitalSpend)}</strong> of capital spend is excluded from both profit
          figures — improvements are not deductible against rental income, though they may matter on
          disposal.
        </p>
      )}

      <p style={{ fontSize: 10, color: '#6b7280', marginTop: 8, lineHeight: 1.6 }}>
        <strong>Cash profit</strong> deducts mortgage interest in full — what actually left your
        account. <strong>Taxable profit</strong> excludes it, because for a personally-held property
        interest is not an allowable expense; it gives the 20% reducer shown instead.
      </p>
    </div>
  )
}
