'use client'

export interface Point { date: string; value: number }

const W = 640
const H = 170
const PAD = { top: 14, right: 14, bottom: 28, left: 40 }

/**
 * Simple date/value line chart shared by the lifestyle tabs. Expects points in
 * chronological order; renders nothing useful below two points, so callers
 * should show their own empty state.
 */
export default function MetricTrend({
  points,
  unit = '',
  colour = '#1d4ed8',
  target,
}: {
  points: Point[]
  unit?: string
  colour?: string
  /** Optional reference line, e.g. an 8-hour sleep goal. */
  target?: number
}) {
  if (points.length === 0) {
    return <p style={{ fontSize: 12, color: '#9ca3af' }}>No entries yet.</p>
  }

  const values = points.map(p => p.value)
  const candidates = target != null ? [...values, target] : values
  const rawMin = Math.min(...candidates)
  const rawMax = Math.max(...candidates)
  // Pad the domain so a flat series doesn't collapse onto one line.
  const span = rawMax - rawMin || Math.max(rawMax * 0.2, 1)
  const min = rawMin - span * 0.15
  const max = rawMax + span * 0.15

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (v: number) => PAD.top + plotH - ((v - min) / (max - min)) * plotH

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' ')
  const short = (d: string) => {
    const dt = new Date(d)
    return Number.isNaN(dt.getTime()) ? d : `${dt.getDate()}/${dt.getMonth() + 1}`
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', maxWidth: W }}>
      {[0, 0.5, 1].map(f => {
        const v = min + (max - min) * (1 - f)
        return (
          <g key={f}>
            <line x1={PAD.left} y1={PAD.top + plotH * f} x2={W - PAD.right} y2={PAD.top + plotH * f} stroke="#f3f4f6" />
            <text x={PAD.left - 6} y={PAD.top + plotH * f + 3} fontSize="8" fill="#9ca3af" textAnchor="end">
              {Math.round(v * 10) / 10}
            </text>
          </g>
        )
      })}

      {target != null && (
        <line
          x1={PAD.left} y1={y(target)} x2={W - PAD.right} y2={y(target)}
          stroke="#10b981" strokeWidth="1" strokeDasharray="4 3"
        />
      )}

      {points.length > 1 && <path d={path} fill="none" stroke={colour} strokeWidth="2" />}

      {points.map((p, i) => (
        <g key={p.date + i}>
          <circle cx={x(i)} cy={y(p.value)} r="3" fill={colour} />
          {(points.length <= 12 || i % Math.ceil(points.length / 8) === 0) && (
            <text x={x(i)} y={H - 8} fontSize="8" fill="#9ca3af" textAnchor="middle">{short(p.date)}</text>
          )}
        </g>
      ))}

      {unit && <text x={PAD.left} y={10} fontSize="8" fill="#9ca3af">{unit}</text>}
    </svg>
  )
}
