'use client'
import { useEffect, useState, useCallback } from 'react'
import type { BloodMarkerWithResults } from '@/lib/health/types'
import BloodAccordion from '@/components/health/BloodAccordion'

export default function BloodPage() {
  const [markers, setMarkers] = useState<BloodMarkerWithResults[]>([])
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [extractPreview, setExtractPreview] = useState<{ markers: { marker_name: string; value: number; unit: string; test_date: string }[]; storagePath: string; fileName: string; fileSize: number } | null>(null)

  useEffect(() => {
    fetch('/api/health/blood/markers').then(r => r.json()).then(d => setMarkers(Array.isArray(d) ? d : []))
  }, [])

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file || file.type !== 'application/pdf') return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/health/blood/extract', { method: 'POST', body: fd })
    const data = await res.json()
    setExtractPreview(data)
    setUploading(false)
  }, [])

  async function confirmExtract() {
    if (!extractPreview) return
    await fetch('/api/health/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: extractPreview.fileName, type: 'blood_result', storage_path: extractPreview.storagePath, file_size_bytes: extractPreview.fileSize, extracted_marker_count: extractPreview.markers.length }) })
    for (const em of extractPreview.markers) {
      const match = markers.find(m => m.name.toLowerCase() === em.marker_name.toLowerCase() || m.short_name?.toLowerCase() === em.marker_name.toLowerCase())
      if (match) {
        await fetch('/api/health/blood/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marker_id: match.id, value: em.value, test_date: em.test_date }) })
      }
    }
    setExtractPreview(null)
    fetch('/api/health/blood/markers').then(r => r.json()).then(d => setMarkers(Array.isArray(d) ? d : []))
  }

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search markers…" style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 12px', fontSize: 12, outline: 'none' }} />
      </div>

      <div onDragOver={e => e.preventDefault()} onDrop={onDrop} style={{ border: '2px dashed #d1d5db', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 16, background: '#fff', cursor: 'pointer' }}>
        {uploading ? <p style={{ fontSize: 12, color: '#6b7280' }}>Extracting markers…</p> : (
          <>
            <div style={{ fontSize: 24, marginBottom: 6 }}>📄</div>
            <p style={{ fontSize: 13, fontWeight: 600 }}>Drop a blood results PDF here</p>
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>JARVIS will extract markers automatically</p>
          </>
        )}
      </div>

      {extractPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 480, maxHeight: '80vh', overflow: 'auto' }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Extracted markers</h3>
            <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>{extractPreview.markers.length} markers found in {extractPreview.fileName}. Review before saving.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead><tr>{['Marker', 'Value', 'Unit', 'Date'].map(h => <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: '#9ca3af', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>{h}</th>)}</tr></thead>
              <tbody>{extractPreview.markers.map((m, i) => <tr key={i}>{[m.marker_name, m.value, m.unit, m.test_date].map((v, j) => <td key={j} style={{ padding: '5px 8px', borderBottom: '1px solid #f3f4f6' }}>{String(v)}</td>)}</tr>)}</tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={confirmExtract} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Save all</button>
              <button onClick={() => setExtractPreview(null)} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <BloodAccordion markers={markers} search={search} />
    </div>
  )
}
