'use client'

export interface TrendPoint { month: string; total: number }

const money = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })

/** Spending per month. Bars rather than a line: months are discrete buckets. */
export default function CategoryTrend({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) {
    return <p style={{ fontSize: 12, color: '#9ca3af' }}>Not enough history yet.</p>
  }

  const W = 720, H = 180, PAD = 34
  const max = Math.max(...points.map(p => p.total), 1)
  const bw = (W - PAD * 2) / points.length

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {points.map((p, i) => {
        const h = (p.total / max) * (H - PAD * 2)
        return (
          <g key={p.month}>
            <rect
              x={PAD + i * bw + bw * 0.15}
              y={H - PAD - h}
              width={bw * 0.7}
              height={Math.max(h, 1)}
              fill="#3b82f6"
              rx="2"
            >
              <title>{`${p.month}: ${money(p.total)}`}</title>
            </rect>
            <text
              x={PAD + i * bw + bw / 2}
              y={H - PAD + 12}
              fontSize="9"
              fill="#9ca3af"
              textAnchor="middle"
            >
              {p.month.slice(5)}
            </text>
          </g>
        )
      })}
      <text x={PAD} y={14} fontSize="10" fill="#9ca3af">{money(max)}</text>
      <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="#e5e7eb" />
    </svg>
  )
}
