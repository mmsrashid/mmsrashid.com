'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { BloodMarkerWithResults } from '@/lib/health/types'

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  high:       { bg: '#fef3c7', color: '#92400e', label: 'High' },
  low:        { bg: '#fee2e2', color: '#991b1b', label: 'Low' },
  borderline: { bg: '#fef3c7', color: '#92400e', label: 'Borderline' },
  normal:     { bg: '#d1fae5', color: '#065f46', label: 'Normal' },
  unknown:    { bg: '#f3f4f6', color: '#6b7280', label: '—' },
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return <span style={{ width: 40, display: 'inline-block' }} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return (
    <svg width="40" height="16" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      {values.map((v, i) => {
        const x = (i / (values.length - 1 || 1)) * 36 + 2
        const y = 14 - ((v - min) / range) * 12
        return i === 0 ? null : (
          <line key={i} x1={(((i-1) / (values.length - 1 || 1)) * 36 + 2)} y1={14 - ((values[i-1]! - min) / range) * 12} x2={x} y2={y} stroke="#6b7280" strokeWidth="1.5" />
        )
      })}
    </svg>
  )
}

export default function BloodAccordion({ markers, search }: { markers: BloodMarkerWithResults[]; search: string }) {
  const router = useRouter()
  const [open, setOpen] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q ? markers.filter(m => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)) : markers
  }, [markers, search])

  const groups = useMemo(() => {
    return filtered.reduce<Record<string, BloodMarkerWithResults[]>>((acc, m) => {
      if (!acc[m.category]) acc[m.category] = []
      acc[m.category]!.push(m)
      return acc
    }, {})
  }, [filtered])

  // Expand any group that has data, not just flagged ones — otherwise a
  // category whose results are all normal looks identical to an empty one.
  const autoOpen = useMemo(() => {
    const s = new Set<string>()
    if (search) Object.keys(groups).forEach(g => s.add(g))
    Object.entries(groups).forEach(([g, ms]) => {
      if (ms.some(m => m.latest_value != null)) s.add(g)
    })
    return s
  }, [groups, search])

  const isOpen = (g: string) => open.has(g) || autoOpen.has(g)
  const toggle = (g: string) => setOpen(o => { const n = new Set(o); isOpen(g) ? n.delete(g) : n.add(g); return n })

  return (
    <div>
      {Object.entries(groups).map(([cat, ms]) => {
        const flagCount = ms.filter(m => m.status === 'high' || m.status === 'low').length
        const trackedCount = ms.filter(m => m.latest_value != null).length
        const expanded = isOpen(cat)
        // Markers with readings first, so data is never buried below empties.
        const ordered = [...ms].sort((a, b) => {
          const d = Number(b.latest_value != null) - Number(a.latest_value != null)
          return d !== 0 ? d : a.name.localeCompare(b.name)
        })
        return (
          <div key={cat} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 8, overflow: 'hidden' }}>
            <div onClick={() => toggle(cat)} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{cat}</span>
              {flagCount > 0 && <span style={{ fontSize: 10, fontWeight: 600, background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 10, marginRight: 8 }}>{flagCount} flagged</span>}
              {trackedCount > 0 && flagCount === 0 && <span style={{ fontSize: 10, fontWeight: 600, background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 10, marginRight: 8 }}>{trackedCount} tracked</span>}
              <span style={{ fontSize: 11, color: '#9ca3af', marginRight: 10 }}>{ms.length} markers</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{expanded ? '▲' : '▼'}</span>
            </div>
            {expanded && ordered.map(m => {
              const ss = STATUS_STYLE[m.status] ?? STATUS_STYLE.unknown!
              const vals = m.results.map(r => r.value).reverse()
              return (
                <div key={m.id} onClick={() => router.push(`/dashboard/health/blood/${encodeURIComponent(m.name)}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderTop: '1px solid #f3f4f6', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span style={{ flex: 1, fontSize: 12 }}>{m.name}</span>
                  <Sparkline values={vals} />
                  <span style={{ fontSize: 12, fontWeight: 600, minWidth: 80, textAlign: 'right' }}>{m.latest_value != null ? `${m.latest_value} ${m.unit ?? ''}` : '—'}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: ss.bg, color: ss.color, minWidth: 56, textAlign: 'center' }}>{ss.label}</span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
