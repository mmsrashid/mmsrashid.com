'use client'
import { useEffect, useState, useCallback } from 'react'
import type { HealthDocument } from '@/lib/health/types'

const TYPE_STYLE: Record<string, { icon: string; bg: string; badge: string; badgeColor: string; label: string }> = {
  blood_result:  { icon: '🩸', bg: '#fee2e2', badge: '#fee2e2', badgeColor: '#991b1b', label: 'Blood Results' },
  letter:        { icon: '✉',  bg: '#dbeafe', badge: '#dbeafe', badgeColor: '#1e40af', label: "Doctor's Letter" },
  scan:          { icon: '🔬', bg: '#fef3c7', badge: '#fef3c7', badgeColor: '#92400e', label: 'Scan / Imaging' },
  prescription:  { icon: '💊', bg: '#d1fae5', badge: '#d1fae5', badgeColor: '#065f46', label: 'Prescription' },
  other:         { icon: '📄', bg: '#f3f4f6', badge: '#f3f4f6', badgeColor: '#6b7280', label: 'Other' },
}

const FILTERS = ['All', 'Blood Results', "Doctor's Letters", 'Scans', 'Prescriptions']
const FILTER_MAP: Record<string, string[]> = { 'Blood Results': ['blood_result'], "Doctor's Letters": ['letter'], 'Scans': ['scan'], 'Prescriptions': ['prescription'] }

export default function DocumentsPage() {
  const [docs, setDocs] = useState<HealthDocument[]>([])
  const [filter, setFilter] = useState('All')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    fetch('/api/health/documents').then(r => r.json()).then(d => setDocs(Array.isArray(d) ? d : []))
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
    const docRes = await fetch('/api/health/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: data.fileName, type: 'other', storage_path: data.storagePath, file_size_bytes: data.fileSize, extracted_marker_count: data.markers?.length ?? 0 }) })
    const newDoc = await docRes.json()
    setDocs(d => [newDoc, ...d])
    setUploading(false)
  }, [])

  const filtered = filter === 'All' ? docs : docs.filter(d => (FILTER_MAP[filter] ?? []).includes(d.type))

  const formatSize = (b: number | null) => {
    if (!b) return ''
    if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`
    return `${(b / 1e3).toFixed(0)} KB`
  }

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1 }} />
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: '1px solid #e5e7eb', background: filter === f ? '#111' : '#fff', color: filter === f ? '#fff' : '#6b7280' }}>{f}</button>
        ))}
      </div>

      <div onDragOver={e => e.preventDefault()} onDrop={onDrop} style={{ border: '2px dashed #d1d5db', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 16, background: '#fff' }}>
        {uploading ? <p style={{ fontSize: 12, color: '#6b7280' }}>Uploading…</p> : (
          <>
            <div style={{ fontSize: 24, marginBottom: 6 }}>📄</div>
            <p style={{ fontSize: 13, fontWeight: 600 }}>Drop PDFs here to upload</p>
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>Blood results, letters, scans, prescriptions</p>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {filtered.map(doc => {
          const ts = TYPE_STYLE[doc.type] ?? TYPE_STYLE.other!
          return (
            <div key={doc.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.08)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: ts.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{ts.icon}</div>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', padding: '2px 7px', borderRadius: 8, background: ts.badge, color: ts.badgeColor }}>{ts.label}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>{doc.name}</div>
              <div style={{ fontSize: 10, color: '#9ca3af' }}>{new Date(doc.created_at).toLocaleDateString()} · {formatSize(doc.file_size_bytes)} · PDF</div>
              {doc.extracted_marker_count > 0 && (
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 9, background: '#f3f4f6', color: '#6b7280', padding: '2px 7px', borderRadius: 6 }}>✓ {doc.extracted_marker_count} markers</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
