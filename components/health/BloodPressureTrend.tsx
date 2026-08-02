'use client'

export interface BpPoint { at: string; systolic: number; diastolic: number }

const W = 720
const H = 210
const PAD = { top: 16, right: 14, bottom: 30, left: 34 }

/**
 * Systolic and diastolic on one pair of axes, with a shaded band up to 130/80.
 *
 * The band is drawn as a reference only — the widely quoted target for someone
 * on treatment — and is deliberately labelled as such rather than presented as
 * a personal goal, which is a clinician's call.
 */
export default function BloodPressureTrend({ points }: { points: BpPoint[] }) {
  if (points.length === 0) {
    return <p style={{ fontSize: 12, color: '#9ca3af' }}>No blood pressure readings yet.</p>
  }

  const values = points.flatMap(p => [p.systolic, p.diastolic])
  const min = Math.min(60, ...values) - 5
  const max = Math.max(150, ...values) + 5

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (v: number) => PAD.top + plotH - ((v - min) / (max - min)) * plotH

  const path = (get: (p: BpPoint) => number) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(get(p))}`).join(' ')

  const short = (iso: string) => {
    const d = new Date(iso)
    return `${d.getDate()}/${d.getMonth() + 1}`
  }
  const tick = Math.max(1, Math.ceil(points.length / 8))

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* Reference band: 130 systolic / 80 diastolic */}
        <rect x={PAD.left} y={y(130)} width={plotW} height={Math.max(0, y(80) - y(130))} fill="#ecfdf5" />
        <line x1={PAD.left} y1={y(130)} x2={W - PAD.right} y2={y(130)} stroke="#10b981" strokeDasharray="4 3" strokeWidth="1" />
        <line x1={PAD.left} y1={y(80)} x2={W - PAD.right} y2={y(80)} stroke="#10b981" strokeDasharray="4 3" strokeWidth="1" />

        {[min, (min + max) / 2, max].map(v => (
          <text key={v} x={PAD.left - 6} y={y(v) + 3} fontSize="8" fill="#9ca3af" textAnchor="end">{Math.round(v)}</text>
        ))}

        <path d={path(p => p.systolic)} fill="none" stroke="#dc2626" strokeWidth="2" />
        <path d={path(p => p.diastolic)} fill="none" stroke="#2563eb" strokeWidth="2" />

        {points.length <= 120 && points.map((p, i) => (
          <g key={p.at + i}>
            <circle cx={x(i)} cy={y(p.systolic)} r="2.2" fill="#dc2626" />
            <circle cx={x(i)} cy={y(p.diastolic)} r="2.2" fill="#2563eb" />
          </g>
        ))}

        {points.map((p, i) => i % tick === 0 && (
          <text key={p.at} x={x(i)} y={H - 8} fontSize="8" fill="#9ca3af" textAnchor="middle">{short(p.at)}</text>
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 14, fontSize: 9, color: '#6b7280', marginTop: 4 }}>
        <span><span style={{ color: '#dc2626', fontWeight: 700 }}>—</span> systolic</span>
        <span><span style={{ color: '#2563eb', fontWeight: 700 }}>—</span> diastolic</span>
        <span><span style={{ color: '#10b981', fontWeight: 700 }}>┄</span> 130/80 reference, not a personal target</span>
      </div>
    </div>
  )
}
