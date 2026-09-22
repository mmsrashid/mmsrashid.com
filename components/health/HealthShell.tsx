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
  { label: 'Vitals', icon: '❤️', href: '/dashboard/health/vitals' },
  { label: 'Sleep', icon: '😴', href: '/dashboard/health/sleep' },
  { label: 'Nutrition', icon: '🥗', href: '/dashboard/health/nutrition' },
  { label: 'Exercise', icon: '🏃', href: '/dashboard/health/exercise' },
  { label: 'Documents', icon: '📄', href: '/dashboard/health/documents' },
  { label: 'Pill Tracker', icon: '✅', href: '/dashboard/health/pill-tracker' },
]

interface Msg { role: 'ai' | 'user'; text: string }
interface Props { children: React.ReactNode }

export default function HealthShell({ children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // Closed by default on a phone: the health page is what you came for.
  const [panelOpen, setPanelOpen] = useState(false)
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
  const tabStripRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, uploading, pending.length])

  // Bring the active tab into view on the scrolling strip. Without this the
  // last tabs are reachable only by guessing that the strip scrolls.
  useEffect(() => {
    const strip = tabStripRef.current
    const active = strip?.querySelector('[data-active="true"]') as HTMLElement | null
    if (strip && active) {
      const target = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2
      strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
    }
  }, [pathname])

  // Anything needing a decision opens the phone panel by itself. Pending items
  // that appear behind a collapsed panel would never be seen, and the upload
  // would look as though it had silently done nothing.
  useEffect(() => {
    if (pending.length > 0 || uploading) setPanelOpen(true)
  }, [pending.length, uploading])

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
      const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
      const a = d.applied
      const parts = [
        a.blood_results && plural(a.blood_results, 'test result'),
        a.medicines && plural(a.medicines, 'medicine'),
        a.appointments && plural(a.appointments, 'appointment'),
        a.sleep && plural(a.sleep, 'sleep night', 'sleep nights'),
        a.nutrition && plural(a.nutrition, 'nutrition day', 'nutrition days'),
        a.exercise && plural(a.exercise, 'workout'),
        a.pill_logs && plural(a.pill_logs, 'pill entry', 'pill entries'),
      ].filter(Boolean) as string[]

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

    const total = Object.values<number>(data.applied ?? {}).reduce((s, n) => s + (n || 0), 0)
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

  /**
   * The chat, attach button and pending-review list.
   *
   * One definition used by both the desktop sidebar and the phone panel. An
   * upload or a pending decision has to be reachable on either, and two copies
   * of this would drift.
   */
  const conversation = (
    <>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            fontSize: 12, lineHeight: 1.5, padding: '7px 9px', borderRadius: 10, maxWidth: '95%',
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
          <div style={{ fontSize: 12, color: '#6b7280', padding: '7px 9px' }}>Reading the document…</div>
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
          style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, color: '#6b7280', cursor: 'pointer', fontSize: 15, padding: '8px 11px', flexShrink: 0 }}
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
          /* 16px: iOS Safari zooms the whole page in when a focused input is
             smaller than that, and the layout never recovers. */
          style={{ flex: 1, minWidth: 0, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 10px', color: '#111', fontSize: 16, outline: 'none' }}
        />
      </div>
    </>
  )

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragging(true) },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const f = e.dataTransfer.files?.[0]
      if (f) void upload(f)
    },
  }

  return (
    <div style={{ height: '100%', overflow: 'hidden' }} className="flex flex-col md:flex-row">
      {/* JARVIS sidebar — tablet and up. On a phone this took 270 of 375px and
          left the health pages unreachable, so below md it becomes the
          collapsible panel further down. */}
      <div
        {...dropHandlers}
        className="hidden md:flex"
        style={{
          width,
          background: '#fff',
          borderRight: '1px solid #e5e7eb',
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
            {conversation}
          </>
        )}
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', height: 44, flexShrink: 0, gap: 8 }}
          className="px-3 md:px-5">
          <span style={{ fontSize: 14, fontWeight: 700 }}>Health Records</span>
          {/* Phone-only JARVIS toggle. A second floating button would fight the
              global orb, so the panel opens in place instead. */}
          <button
            onClick={() => setPanelOpen(o => !o)}
            className="md:hidden"
            style={{
              marginLeft: 'auto', border: '1px solid #dbeafe', background: '#eff6ff',
              color: '#1e40af', borderRadius: 8, padding: '5px 10px',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ◉ JARVIS{pending.length > 0 ? ` · ${pending.length}` : ''} {panelOpen ? '▴' : '▾'}
          </button>
        </div>

        {/* Phone JARVIS panel, in the flow rather than over the content. */}
        {panelOpen && (
          <div
            {...dropHandlers}
            className="md:hidden"
            style={{
              background: '#fff', borderBottom: '1px solid #e5e7eb', flexShrink: 0,
              display: 'flex', flexDirection: 'column', height: '55vh',
              outline: dragging ? '2px dashed #2563eb' : 'none', outlineOffset: -4,
            }}
          >
            {conversation}
          </div>
        )}

        {/* Eleven tabs need 880px. A sideways-scrolling strip was the first
            attempt and it was wrong: Pill Tracker sat 760px in, and with the
            scrollbar hidden nothing said the strip scrolled at all. On a phone
            the tabs are a dropdown instead — every one reachable in one tap,
            none off screen. */}
        <div className="md:hidden" style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '8px 12px', flexShrink: 0 }}>
          <select
            value={TABS.find(t => pathname.startsWith(t.href))?.href ?? TABS[0].href}
            onChange={e => router.push(e.target.value)}
            aria-label="Health section"
            /* 16px stops iOS Safari zooming the page on focus. */
            style={{
              width: '100%', border: '1px solid #d1d5db', borderRadius: 8,
              padding: '9px 10px', fontSize: 16, fontWeight: 600, background: '#fff',
              color: '#111',
            }}
          >
            {TABS.map(tab => (
              <option key={tab.href} value={tab.href}>{tab.icon}  {tab.label}</option>
            ))}
          </select>
        </div>

        {/* Tablet and up: the icon strip. Still scrollable, because 880px of
            tabs does not fit 768px either — but here the active tab is scrolled
            into view so it is never the one you cannot find. */}
        <div
          ref={tabStripRef}
          style={{
            background: '#fff', borderBottom: '1px solid #e5e7eb',
            flexShrink: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          }}
          className="hidden md:flex px-5"
        >
          {TABS.map(tab => {
            const active = pathname.startsWith(tab.href)
            return (
              <button key={tab.href} onClick={() => router.push(tab.href)} data-active={active} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '9px 14px', cursor: 'pointer', border: 'none', background: 'none',
                borderBottom: active ? '2px solid #111' : '2px solid transparent',
                color: active ? '#111' : '#6b7280', fontSize: 10, fontWeight: 600,
                flexShrink: 0, whiteSpace: 'nowrap',
              }}>
                <span style={{ fontSize: 19 }}>{tab.icon}</span>
                {tab.label}
              </button>
            )
          })}
        </div>
        {/* key remounts the page so it refetches after an ingest.
            Bottom padding on a phone keeps the last row clear of the floating
            JARVIS orb, which otherwise sits on top of it. */}
        <div key={dataVersion} style={{ flex: 1, overflowY: 'auto' }} className="pb-20 md:pb-0">
          {children}
        </div>
      </div>
    </div>
  )
}
