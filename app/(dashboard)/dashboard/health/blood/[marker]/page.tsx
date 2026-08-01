'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { BloodMarkerWithResults } from '@/lib/health/types'
import BloodTrendChart from '@/components/health/BloodTrendChart'
import ImprovementCard from '@/components/health/ImprovementCard'

const STATUS_COLOR: Record<string, string> = { high: '#f59e0b', low: '#ef4444', normal: '#10b981', borderline: '#f59e0b', unknown: '#9ca3af' }

export default function MarkerDetailPage() {
  const { marker: markerParam } = useParams<{ marker: string }>()
  const router = useRouter()
  const [marker, setMarker] = useState<BloodMarkerWithResults | null>(null)

  useEffect(() => {
    fetch('/api/health/blood/markers').then(r => r.json()).then((all: BloodMarkerWithResults[]) => {
      const found = all.find(m => m.name === decodeURIComponent(markerParam))
      setMarker(found ?? null)
    })
  }, [markerParam])

  if (!marker) return <div style={{ padding: 40, fontSize: 12, color: '#9ca3af' }}>Loading…</div>

  const sorted = [...marker.results].sort((a, b) => b.test_date.localeCompare(a.test_date))
  const col = STATUS_COLOR[marker.status] ?? '#9ca3af'

  return (
    <div style={{ padding: '20px 22px', maxWidth: 720 }}>
      <button onClick={() => router.push('/dashboard/health/blood')} style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 16 }}>← Back to panel</button>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>{marker.name}</h1>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{marker.category}</p>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: col }}>{marker.latest_value ?? '—'}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{marker.unit}</div>
        </div>
        <div style={{ background: col + '20', color: col, padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700 }}>
          {marker.status.charAt(0).toUpperCase() + marker.status.slice(1)}
        </div>
        {marker.ref_low != null && marker.ref_high != null && (
          <div style={{ textAlign: 'right', fontSize: 11, color: '#6b7280' }}>
            <div style={{ fontWeight: 600 }}>Reference</div>
            <div>{marker.ref_low}–{marker.ref_high} {marker.unit}</div>
          </div>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Trend over time</div>
        <BloodTrendChart marker={marker} />
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontSize: 12, fontWeight: 700 }}>Results history</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead><tr>{['Date', 'Value', 'Unit', 'Reference', 'Status', 'Lab'].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 14px', background: '#fafafa', color: '#9ca3af', fontWeight: 600, borderBottom: '1px solid #f3f4f6' }}>{h}</th>)}</tr></thead>
          <tbody>
            {sorted.map(r => {
              let st = 'normal'
              if (marker.ref_high != null && r.value > marker.ref_high) st = 'high'
              else if (marker.ref_low != null && r.value < marker.ref_low) st = 'low'
              const c = STATUS_COLOR[st] ?? '#9ca3af'
              return (
                <tr key={r.id}>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f9fafb' }}>{r.test_date}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f9fafb', fontWeight: 700, color: c }}>{r.value}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f9fafb', color: '#6b7280' }}>{marker.unit}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f9fafb', color: '#6b7280' }}>{marker.ref_low ?? '?'}–{marker.ref_high ?? '?'}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f9fafb' }}><span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 8, background: c + '20', color: c }}>{st}</span></td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f9fafb', color: '#9ca3af' }}>{r.lab_name ?? '—'}</td>
                </tr>
              )
            })}
            {!sorted.length && <tr><td colSpan={6} style={{ padding: '16px 14px', color: '#9ca3af', textAlign: 'center' }}>No results recorded yet</td></tr>}
          </tbody>
        </table>
      </div>

      <ImprovementCard marker={marker} />
    </div>
  )
}
