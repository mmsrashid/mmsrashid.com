'use client'
import { useEffect, useState } from 'react'

interface EmailMsg { uid: number; from?: string; subject?: string; date?: string; text?: string; html?: string }

export default function MessagesPage() {
  const [msgs, setMsgs] = useState<EmailMsg[]>([])
  const [selected, setSelected] = useState<EmailMsg | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/health/messages').then(r => r.json()).then(d => { setMsgs(Array.isArray(d) ? d : []); setLoading(false) })
  }, [])

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 280, borderRight: '1px solid #e5e7eb', overflowY: 'auto', background: '#fff' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 13, fontWeight: 700 }}>Health Messages</div>
        {loading && <p style={{ padding: 14, fontSize: 12, color: '#9ca3af' }}>Loading…</p>}
        {!loading && msgs.length === 0 && <p style={{ padding: 14, fontSize: 12, color: '#9ca3af' }}>No health-related messages found.</p>}
        {msgs.map(m => (
          <div key={m.uid} onClick={() => setSelected(m)} style={{ padding: '10px 14px', borderBottom: '1px solid #f9fafb', cursor: 'pointer', background: selected?.uid === m.uid ? '#f0f9ff' : '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#dbeafe', color: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {(m.from ?? '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.from}</div>
                <div style={{ fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.subject}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#fafafa' }}>
        {!selected ? (
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 40, textAlign: 'center' }}>Select a message to read</p>
        ) : (
          <>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{selected.subject}</h2>
            <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 16 }}>From: {selected.from} · {selected.date}</p>
            <div style={{ fontSize: 12, lineHeight: 1.7, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
              {selected.html
                ? <div dangerouslySetInnerHTML={{ __html: selected.html }} />
                : <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{selected.text}</pre>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
