'use client'
import { useMemo, useState } from 'react'

export interface DayPoint { date: string; taken: number; total: number }

const W = 720
const H = 190
const PAD = { top: 16, right: 16, bottom: 30, left: 34 }

const RANGES = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6m', days: 182 },
  { label: 'All', days: 0 },
] as const

/**
 * Adherence as a percentage per day, with a rolling average so a long history
 * reads as a trend rather than a spiky 0/100 sawtooth.
 */
export default function AdherenceTrend({ days }: { days: DayPoint[] }) {
  const [rangeIdx, setRangeIdx] = useState(0)
  const range = RANGES[rangeIdx]!

  const { points, avg, streak, window } = useMemo(() => {
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
    const scoped = range.days > 0 ? sorted.slice(-range.days) : sorted
    const pts = scoped.map(d => ({
      date: d.date,
      pct: d.total > 0 ? (d.taken / d.total) * 100 : 0,
    }))

    // Wider smoothing on longer ranges so the line stays readable.
    const win = scoped.length > 120 ? 14 : scoped.length > 45 ? 7 : 3
    const smoothed = pts.map((_, i) => {
      const from = Math.max(0, i - win + 1)
      const slice = pts.slice(from, i + 1)
      return slice.reduce((s, p) => s + p.pct, 0) / slice.length
    })

    const mean = pts.length ? pts.reduce((s, p) => s + p.pct, 0) / pts.length : 0

    // Consecutive fully-taken days, counting back from the most recent.
    let run = 0
    for (let i = sorted.length - 1; i >= 0; i--) {
      const d = sorted[i]!
      if (d.total > 0 && d.taken === d.total) run++
      else break
    }

    return { points: pts.map((p, i) => ({ ...p, smooth: smoothed[i]! })), avg: mean, streak: run, window: win }
  }, [days, range])

  if (points.length === 0) {
    return <p style={{ fontSize: 12, color: '#9ca3af' }}>No history yet — tick some days, or import a CSV.</p>
  }

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (pct: number) => PAD.top + plotH - (pct / 100) * plotH

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.smooth)}`).join(' ')
  const area = `${line} L ${x(points.length - 1)} ${PAD.top + plotH} L ${x(0)} ${PAD.top + plotH} Z`
  const short = (d: string) => { const t = new Date(d + 'T12:00:00'); return `${t.getDate()}/${t.getMonth() + 1}` }
  const tickEvery = Math.max(1, Math.ceil(points.length / 8))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 14, flex: 1, minWidth: 200 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{Math.round(avg)}%</div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>average over {range.label === 'All' ? 'all time' : range.label}</div>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{streak}</div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>day full streak</div>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{points.length}</div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>days shown</div>
          </div>
        </div>
        {RANGES.map((r, i) => (
          <button key={r.label} onClick={() => setRangeIdx(i)} style={{
            border: '1px solid #e5e7eb', borderRadius: 8, padding: '4px 10px', fontSize: 10, cursor: 'pointer',
            background: i === rangeIdx ? '#111' : '#fff', color: i === rangeIdx ? '#fff' : '#374151', fontWeight: 600,
          }}>{r.label}</button>
        ))}
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {[0, 50, 100].map(v => (
          <g key={v}>
            <line x1={PAD.left} y1={y(v)} x2={W - PAD.right} y2={y(v)} stroke="#f3f4f6" />
            <text x={PAD.left - 6} y={y(v) + 3} fontSize="8" fill="#9ca3af" textAnchor="end">{v}%</text>
          </g>
        ))}

        <path d={area} fill="#dbeafe" opacity="0.7" />
        <path d={line} fill="none" stroke="#1d4ed8" strokeWidth="2" />

        {/* Raw daily values, muted, so individual misses are still visible. */}
        {points.length <= 120 && points.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.pct)} r="1.8"
            fill={p.pct === 100 ? '#059669' : p.pct === 0 ? '#dc2626' : '#f59e0b'} opacity="0.75" />
        ))}

        {points.map((p, i) => i % tickEvery === 0 && (
          <text key={p.date} x={x(i)} y={H - 8} fontSize="8" fill="#9ca3af" textAnchor="middle">{short(p.date)}</text>
        ))}
      </svg>

      <p style={{ fontSize: 9, color: '#9ca3af', marginTop: 4 }}>
        Line is a {window}-day rolling average. Dots are individual days — green all taken, amber partial, red none.
      </p>
    </div>
  )
}
