'use client'
import type { BloodMarkerWithResults } from '@/lib/health/types'

const W = 560, H = 200, PAD = { top: 16, right: 16, bottom: 36, left: 48 }
const INNER_W = W - PAD.left - PAD.right
const INNER_H = H - PAD.top - PAD.bottom

export default function BloodTrendChart({ marker }: { marker: BloodMarkerWithResults }) {
  const sorted = [...marker.results].sort((a, b) => a.test_date.localeCompare(b.test_date))
  if (!sorted.length) return <p style={{ fontSize: 12, color: '#9ca3af' }}>No results yet</p>

  const vals = sorted.map(r => r.value)
  const refLow = marker.ref_low
  const refHigh = marker.ref_high
  const allVals = [...vals, ...(refLow != null ? [refLow] : []), ...(refHigh != null ? [refHigh] : [])]
  const minV = Math.min(...allVals) * 0.9
  const maxV = Math.max(...allVals) * 1.1
  const range = maxV - minV || 1

  const toX = (i: number) => PAD.left + (i / (sorted.length - 1 || 1)) * INNER_W
  const toY = (v: number) => PAD.top + INNER_H - ((v - minV) / range) * INNER_H

  const pointColor = (v: number) => {
    if (refHigh != null && v > refHigh) return '#ef4444'
    if (refLow != null && v < refLow) return '#ef4444'
    return '#10b981'
  }

  const linePath = sorted.map((r, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(r.value)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block' }}>
      {refLow != null && refHigh != null && (
        <rect x={PAD.left} y={toY(refHigh)} width={INNER_W} height={toY(refLow) - toY(refHigh)} fill="#d1fae5" opacity={0.6} />
      )}
      {[0, 0.25, 0.5, 0.75, 1].map(f => {
        const y = PAD.top + f * INNER_H
        const v = maxV - f * range
        return (
          <g key={f}>
            <line x1={PAD.left} y1={y} x2={PAD.left + INNER_W} y2={y} stroke="#f3f4f6" strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#9ca3af">{v.toFixed(1)}</text>
          </g>
        )
      })}
      <path d={linePath} fill="none" stroke="#6b7280" strokeWidth={2} />
      {sorted.map((r, i) => (
        <g key={r.id}>
          <circle cx={toX(i)} cy={toY(r.value)} r={5} fill={pointColor(r.value)} stroke="#fff" strokeWidth={1.5} />
          <text x={toX(i)} y={H - 6} textAnchor="middle" fontSize={8} fill="#9ca3af">{r.test_date.slice(0, 7)}</text>
        </g>
      ))}
      {refHigh != null && <line x1={PAD.left} y1={toY(refHigh)} x2={PAD.left + INNER_W} y2={toY(refHigh)} stroke="#10b981" strokeWidth={1} strokeDasharray="4" />}
      {refLow != null && <line x1={PAD.left} y1={toY(refLow)} x2={PAD.left + INNER_W} y2={toY(refLow)} stroke="#10b981" strokeWidth={1} strokeDasharray="4" />}
    </svg>
  )
}
