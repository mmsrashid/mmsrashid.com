'use client'
import { useEffect, useState } from 'react'
import type { HealthDocument } from '@/lib/health/types'

interface Loaded { url: string; kind: 'pdf' | 'image' | 'other'; name: string }

/**
 * Shows the original uploaded file. The bucket is private, so the URL is signed
 * on demand rather than stored.
 */
export default function DocumentViewer({
  doc,
  onClose,
  onDeleted,
}: {
  doc: HealthDocument
  onClose: () => void
  onDeleted?: (id: string) => void
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/health/documents/${doc.id}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.error) setError(d.error)
        else setLoaded(d)
      })
      .catch(e => !cancelled && setError(String(e)))
    return () => { cancelled = true }
  }, [doc.id])

  // Escape closes, matching normal dialog behaviour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function remove() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/health/documents/${doc.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Could not delete.'); return }
      onDeleted?.(doc.id)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,24,39,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 50,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, width: 'min(1000px, 100%)', height: 'min(90vh, 100%)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>
              {doc.type.replace('_', ' ')}
              {doc.extracted_marker_count ? ` · ${doc.extracted_marker_count} markers extracted` : ''}
              {doc.file_size_bytes ? ` · ${Math.round(doc.file_size_bytes / 1024)} KB` : ''}
            </div>
          </div>
          {loaded && (
            <a href={loaded.url} target="_blank" rel="noreferrer"
              style={{ fontSize: 10, fontWeight: 600, color: '#1d4ed8', textDecoration: 'none', border: '1px solid #dbeafe', borderRadius: 8, padding: '5px 10px' }}>
              Open in new tab
            </a>
          )}
          {confirmDelete ? (
            <>
              <button onClick={remove} disabled={deleting}
                style={{ fontSize: 10, fontWeight: 600, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
                {deleting ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)}
                style={{ fontSize: 10, background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} title="Delete document"
              style={{ fontSize: 10, color: '#991b1b', background: '#fff', border: '1px solid #fecaca', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>
              Delete
            </button>
          )}
          <button onClick={onClose} aria-label="Close"
            style={{ fontSize: 16, background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {error && <p style={{ fontSize: 12, color: '#991b1b', padding: 24 }}>{error}</p>}
          {!error && !loaded && <p style={{ fontSize: 12, color: '#9ca3af' }}>Loading document…</p>}

          {loaded?.kind === 'pdf' && (
            <iframe src={loaded.url} title={doc.name} style={{ width: '100%', height: '100%', border: 'none' }} />
          )}
          {loaded?.kind === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={loaded.url} alt={doc.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          )}
          {loaded?.kind === 'other' && (
            <p style={{ fontSize: 12, color: '#6b7280', padding: 24 }}>
              This file type can&apos;t be previewed. Use &ldquo;Open in new tab&rdquo; to download it.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
