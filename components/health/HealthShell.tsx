'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import PendingReview from './PendingReview'
import type { IngestResponse, PendingRecord } from '@/lib/health/types'

const TABS = [
  { label: 'Home', icon: '🏠', href: '/dashboard/health/home' },
  { label: 'Appointments', icon: '📅', href: '/dashboard/health/appointments' },
  { label: 'Messages', icon: '💬', href: '/dashboard/health/messages' },
  { label: 'Medicines', icon: '💊', href: '/dashboard/health/medicines' },
  { label: 'Test Results', icon: '🩸', href: '/dashboard/health/blood' },
  { label: 'Documents', icon: '📄', href: '/dashboard/health/documents' },
  { label: 'Pill Tracker', icon: '✅', href: '/dashboard/health/pill-tracker' },
]

interface Msg { role: 'ai' | 'user'; text: string }
interface Props { children: React.ReactNode }

export default function HealthShell({ children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'ai', text: "Good day. I'm JARVIS, your health assistant. Ask me anything, or drop in a document or screenshot and I'll file it." },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState<PendingRecord[]>([])
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
      const res = await fetch('/api/health/ingest', { method: 'POST', body: fd })
      const data = await res.json()

      if (!res.ok) {
        say(data.error || 'I could not read that file.')
        return
      }

      const d = data as IngestResponse
      const parts: string[] = []
      if (d.applied.blood_results) parts.push(`${d.applied.blood_results} test result${d.applied.blood_results > 1 ? 's' : ''}`)
      if (d.applied.medicines) parts.push(`${d.applied.medicines} medicine${d.applied.medicines > 1 ? 's' : ''}`)
      if (d.applied.appointments) parts.push(`${d.applied.appointments} appointment${d.applied.appointments > 1 ? 's' : ''}`)

      const lines = [d.summary || 'Filed the document.']
      lines.push(parts.length ? `Added ${parts.join(', ')}.` : 'Nothing was added automatically.')
      if (d.pending.length) lines.push(`${d.pending.length} item${d.pending.length > 1 ? 's need' : ' needs'} your check below.`)
      if (d.errors.length) lines.push(`Problems: ${d.errors.join('; ')}`)
      say(lines.join('\n'))

      setPending(d.pending)
      setPendingDocId(d.document?.id ?? null)
      if (parts.length) setDataVersion(v => v + 1)
    } catch (err) {
      say(`Upload failed: ${String(err)}`)
    } finally {
      setUploading(false)
    }
  }, [uploading])

  // Ctrl+V a screenshot anywhere on the health pages.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.items ?? [])
        .find(i => i.kind === 'file')
        ?.getAsFile()
      if (file) {
        e.preventDefault()
        void upload(file)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [upload])

  async function applyPending(chosen: PendingRecord[]) {
    const res = await fetch('/api/health/ingest/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: chosen, document_id: pendingDocId }),
    })
    const data = await res.json()
    if (!res.ok) return say(data.error || 'Could not save those records.')

    const total = (data.applied?.blood_results ?? 0) + (data.applied?.medicines ?? 0) + (data.applied?.appointments ?? 0)
    say(total ? `Saved ${total} record${total > 1 ? 's' : ''}.` : 'Nothing was saved.')
    if (data.errors?.length) say(`Problems: ${data.errors.join('; ')}`)
    setPending([])
    if (total) setDataVersion(v => v + 1)
  }

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    const history = [...messages, { role: 'user' as const, text: userMsg }]
    setMessages(history)
    setLoading(true)
    try {
      // The API takes an Anthropic-shaped messages array. Drop the opening
      // greeting, since a conversation cannot start with an assistant turn.
      const wire = history
        .filter((m, i) => !(i === 0 && m.role === 'ai'))
        .filter(m => m.text.trim() && !m.text.startsWith('📎 '))
        .map(m => ({ role: m.role === 'ai' ? 'assistant' as const : 'user' as const, content: m.text }))

      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: wire, context: 'health' }),
      })
      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let aiText = ''
      setMessages(m => [...m, { role: 'ai', text: '' }])
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of dec.decode(value).split('\n')) {
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (raw === '[DONE]') break
          try {
            const ev = JSON.parse(raw)
            if (ev.type === 'text') {
              aiText += ev.text
              setMessages(m => [...m.slice(0, -1), { role: 'ai', text: aiText }])
            }
          } catch { /* skip */ }
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const width = !sidebarOpen ? 44 : pending.length ? 400 : 270

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* JARVIS sidebar */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files?.[0]
          if (f) void upload(f)
        }}
        style={{
          width,
          background: '#fff',
          borderRight: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          transition: 'width .2s',
          overflow: 'hidden',
          outline: dragging ? '2px dashed #2563eb' : 'none',
          outlineOffset: -4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 12px', borderBottom: '1px solid #e5e7eb' }}>
          {sidebarOpen && <span style={{ color: '#111', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>◉ &nbsp;JARVIS</span>}
          <button onClick={() => setSidebarOpen(o => !o)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 }}>
            {sidebarOpen ? '←' : '→'}
          </button>
        </div>

        {sidebarOpen && (
          <>
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {messages.map((m, i) => (
                <div key={i} style={{
                  fontSize: 11, lineHeight: 1.5, padding: '7px 9px', borderRadius: 10, maxWidth: '95%',
                  whiteSpace: 'pre-wrap',
                  background: m.role === 'ai' ? '#eff6ff' : '#f3f4f6',
                  border: `1px solid ${m.role === 'ai' ? '#dbeafe' : '#e5e7eb'}`,
                  color: m.role === 'ai' ? '#1e40af' : '#374151',
                  alignSelf: m.role === 'ai' ? 'flex-start' : 'flex-end',
                }}>
                  {m.text || (loading && m.role === 'ai' ? '…' : '')}
                </div>
              ))}

              {uploading && (
                <div style={{ fontSize: 11, color: '#6b7280', padding: '7px 9px' }}>Reading the document…</div>
              )}

              {pending.length > 0 && (
                <PendingReview
                  items={pending}
                  onApply={applyPending}
                  onDismiss={() => { setPending([]); say('Discarded the unconfirmed items.') }}
                />
              )}
            </div>

            {dragging && (
              <div style={{ fontSize: 10, color: '#2563eb', fontWeight: 600, textAlign: 'center', padding: '0 10px 6px' }}>Drop to file it</div>
            )}

            <div style={{ padding: 8, borderTop: '1px solid #e5e7eb', display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                onClick={() => fileInput.current?.click()}
                title="Attach a PDF or image"
                style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, color: '#6b7280', cursor: 'pointer', fontSize: 13, padding: '5px 9px', flexShrink: 0 }}
              >📎</button>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) void upload(f)
                  e.target.value = ''
                }}
                style={{ display: 'none' }}
              />
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Ask, or paste a screenshot…"
                style={{ flex: 1, minWidth: 0, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', color: '#111', fontSize: 11, outline: 'none' }}
              />
            </div>
          </>
        )}
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 20px', display: 'flex', alignItems: 'center', height: 50, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Health Records</span>
        </div>
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 20px', display: 'flex', flexShrink: 0 }}>
          {TABS.map(tab => {
            const active = pathname.startsWith(tab.href)
            return (
              <button key={tab.href} onClick={() => router.push(tab.href)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '10px 18px', cursor: 'pointer', border: 'none', background: 'none',
                borderBottom: active ? '2px solid #111' : '2px solid transparent',
                color: active ? '#111' : '#6b7280', fontSize: 10, fontWeight: 600,
              }}>
                <span style={{ fontSize: 20 }}>{tab.icon}</span>
                {tab.label}
              </button>
            )
          })}
        </div>
        {/* key remounts the page so it refetches after an ingest */}
        <div key={dataVersion} style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
