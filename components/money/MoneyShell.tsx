'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import PendingReview from './PendingReview'
import type { ExtractedBalance } from '@/lib/money/types'

const TABS = [
  { label: 'Overview', icon: '📊', href: '/dashboard/money/overview' },
  { label: 'Accounts', icon: '🏦', href: '/dashboard/money/accounts' },
  { label: 'History', icon: '🕘', href: '/dashboard/money/history' },
]

interface Msg { role: 'ai' | 'user'; text: string }

export default function MoneyShell({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'ai', text: "I can read a statement or a banking-app screenshot and file the balances. Drop one in, or ask me about your net worth." },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState<ExtractedBalance[]>([])
  const [pendingDocId, setPendingDocId] = useState<string | null>(null)
  // Bumping this remounts the tab subtree so its useEffect refetches.
  const [dataVersion, setDataVersion] = useState(0)

  const fileInput = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, uploading, pending.length])

  const say = (text: string) => setMessages(m => [...m, { role: 'ai', text }])

  const upload = useCallback(async (file: File) => {
    if (uploading) return
    setUploading(true)
    setMessages(m => [...m, { role: 'user', text: `📎 ${file.name || 'screenshot'}` }])
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/money/ingest', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { say(data.error || 'I could not read that file.'); return }

      const bits: string[] = []
      if (data.applied) bits.push(`Filed ${data.applied} balance${data.applied === 1 ? '' : 's'}.`)
      if (data.pending?.length) bits.push(`${data.pending.length} need${data.pending.length === 1 ? 's' : ''} your check below.`)
      if (data.unmatched?.length) bits.push(`No matching account for: ${data.unmatched.join(', ')}. Add the account, then re-upload.`)
      say(bits.join(' ') || 'Nothing to file from that one.')
      setPending(data.pending ?? [])
      setPendingDocId(data.document_id ?? null)
      setDataVersion(v => v + 1)
      router.refresh()
    } catch (err) {
      say(`That upload failed: ${String(err)}`)
    } finally {
      setUploading(false)
    }
  }, [uploading, router])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text }])
    setLoading(true)
    try {
      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: text }], context: 'money' }),
      })
      const raw = await res.text()
      let out = ''
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue
        try {
          const d = JSON.parse(line.slice(6))
          if (d.type === 'text') out += d.text
        } catch { /* partial frame */ }
      }
      say(out || 'I did not get a reply to that.')
      setDataVersion(v => v + 1)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: '#fff', color: '#111' }}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault(); setDragging(false)
        const f = e.dataTransfer.files?.[0]; if (f) void upload(f)
      }}
    >
      <aside style={{ width: 300, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', fontSize: 12, fontWeight: 700 }}>
          ◉ JARVIS
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              background: m.role === 'ai' ? '#eff6ff' : '#f3f4f6',
              borderRadius: 10, padding: '8px 10px', marginBottom: 8, fontSize: 12, lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>{m.text}</div>
          ))}
          {pending.length > 0 && (
            <PendingReview
              rows={pending}
              documentId={pendingDocId}
              onDone={saved => {
                setPending([])
                setPendingDocId(null)
                say(saved > 0 ? `Saved ${saved} more.` : 'Nothing else saved.')
                setDataVersion(v => v + 1)
              }}
            />
          )}
          {(loading || uploading) && (
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{uploading ? 'Reading…' : 'Thinking…'}</div>
          )}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid #e5e7eb', display: 'flex', gap: 6 }}>
          <button onClick={() => fileInput.current?.click()} title="Attach a statement, screenshot or CSV"
            style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '6px 9px', cursor: 'pointer' }}>
            📎
          </button>
          <input ref={fileInput} type="file" style={{ display: 'none' }}
            accept="image/*,application/pdf,.csv,text/csv"
            onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void send() }}
            onPaste={e => {
              const f = Array.from(e.clipboardData.files)[0]
              if (f) { e.preventDefault(); void upload(f) }
            }}
            placeholder="Ask, or paste a screenshot…"
            style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}
          />
        </div>
      </aside>

      <main style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '14px 22px 0', fontSize: 15, fontWeight: 700 }}>Money</div>
        <nav style={{ display: 'flex', gap: 4, padding: '10px 18px', borderBottom: '1px solid #e5e7eb' }}>
          {TABS.map(t => {
            const active = pathname === t.href
            return (
              <button key={t.href} onClick={() => router.push(t.href)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '6px 12px',
                  fontSize: 11, fontWeight: active ? 700 : 500,
                  color: active ? '#111' : '#6b7280',
                  borderBottom: active ? '2px solid #111' : '2px solid transparent',
                }}>
                <div style={{ fontSize: 16 }}>{t.icon}</div>{t.label}
              </button>
            )
          })}
        </nav>
        {dragging && (
          <div style={{ margin: 18, padding: 20, border: '2px dashed #3b82f6', borderRadius: 12, textAlign: 'center', fontSize: 12, color: '#3b82f6' }}>
            Drop the statement to file it
          </div>
        )}
        <div key={dataVersion}>{children}</div>
      </main>
    </div>
  )
}
