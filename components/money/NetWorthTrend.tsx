'use client'
import type { NetWorthPoint } from '@/lib/money/net-worth'

const money = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })

/**
 * Net worth over time. Plots the net line plus assets and liabilities, and
 * always surfaces how many accounts each point is based on — a chart that
 * hides an incomplete denominator invites false confidence.
 */
export default function NetWorthTrend({ points }: { points: NetWorthPoint[] }) {
  if (points.length === 0) {
    return <p style={{ fontSize: 12, color: '#9ca3af' }}>No balances recorded yet.</p>
  }
  if (points.length === 1) {
    const p = points[0]
    return (
      <p style={{ fontSize: 12, color: '#6b7280' }}>
        One snapshot so far — {money(p.net)} on {p.date}. Add another to see a trend.
      </p>
    )
  }

  const W = 720, H = 220, PAD = 40
  const values = points.flatMap(p => [p.net, p.assets, -p.liabilities])
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  const span = max - min || 1

  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2)
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2)

  const path = (get: (p: NetWorthPoint) => number) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(get(p))}`).join(' ')

  const incomplete = points.some(p => p.accountsCounted < p.accountsTotal)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {/* zero line, so a negative net worth is unmistakable */}
        <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="#d1d5db" strokeDasharray="3 3" />
        <path d={path(p => p.assets)} fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.7" />
        <path d={path(p => -p.liabilities)} fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.7" />
        <path d={path(p => p.net)} fill="none" stroke="#111" strokeWidth="2.5" />
        {points.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.net)} r="3" fill="#111">
            <title>{`${p.date}: ${money(p.net)} (${p.accountsCounted}/${p.accountsTotal} accounts)`}</title>
          </circle>
        ))}
        <text x={PAD} y={16} fontSize="10" fill="#9ca3af">{money(max)}</text>
        <text x={PAD} y={H - 8} fontSize="10" fill="#9ca3af">{money(min)}</text>
        <text x={W - PAD} y={H - 8} fontSize="10" fill="#9ca3af" textAnchor="end">
          {points[points.length - 1].date}
        </text>
      </svg>
      <div style={{ display: 'flex', gap: 14, fontSize: 10, color: '#6b7280' }}>
        <span>— net worth</span>
        <span style={{ color: '#10b981' }}>— assets</span>
        <span style={{ color: '#ef4444' }}>— debts</span>
      </div>
      {incomplete && (
        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>
          Some points cover fewer accounts than you hold — an account only counts once it has a
          balance on or before that date.
        </p>
      )}
    </div>
  )
}
