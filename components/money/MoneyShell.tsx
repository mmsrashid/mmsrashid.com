'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import PendingReview from './PendingReview'
import ImportQueue, { type StagedFile } from './ImportQueue'
import type { ExtractedBalance, MoneyAccount } from '@/lib/money/types'

const TABS = [
  { label: 'Overview', icon: '📊', href: '/dashboard/money/overview' },
  { label: 'Personal', icon: '🧾', href: '/dashboard/money/personal' },
  { label: 'Transactions', icon: '📃', href: '/dashboard/money/transactions' },
  { label: 'Property', icon: '🏘️', href: '/dashboard/money/property' },
  { label: 'Accounts', icon: '🏦', href: '/dashboard/money/accounts' },
  { label: 'History', icon: '🕘', href: '/dashboard/money/history' },
]

interface Msg { role: 'ai' | 'user'; text: string }

export default function MoneyShell({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'ai', text: "Drop in bank statements — CSV, PDF or a screenshot. Several at once is fine, and you pick which account each belongs to before anything is filed." },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState<ExtractedBalance[]>([])
  const [pendingDocId, setPendingDocId] = useState<string | null>(null)
  // Which account an uploaded statement belongs to. A file cannot always say —
  // a Starling feed names no account at all — and without a way to choose,
  // "I could not tell which account" was a dead end: the only advice was to
  // re-upload, which failed identically.
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [staged, setStaged] = useState<StagedFile[]>([])
  // Closed by default on a phone: the Money page is what you came for. On a
  // 375px screen the sidebar took 300 of it and left the tables unreadable.
  const [panelOpen, setPanelOpen] = useState(false)
  // Bumping this remounts the tab subtree so its useEffect refetches.
  const [dataVersion, setDataVersion] = useState(0)

  const fileInput = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, uploading, pending.length])

  // A staged file or a pending balance needs a decision. Behind a collapsed
  // panel it would never be seen, and the upload would look as though it had
  // silently done nothing.
  useEffect(() => {
    if (pending.length > 0 || staged.length > 0 || uploading) setPanelOpen(true)
  }, [pending.length, staged.length, uploading])

  useEffect(() => {
    fetch('/api/money/accounts')
      .then(r => r.json())
      .then(d => {
        const live = Array.isArray(d) ? d.filter((a: MoneyAccount) => a.status === 'active') : []
        setAccounts(live)
        // With exactly one account there is nothing to choose, so pre-fill any
        // file already waiting.
        if (live.length === 1) {
          setStaged(prev => prev.map(f =>
            f.status === 'waiting' && !f.accountId ? { ...f, accountId: live[0].id } : f))
        }
      })
      .catch(() => setAccounts([]))
  }, [dataVersion])

  const say = (text: string) => setMessages(m => [...m, { role: 'ai', text }])

  /** Adds files to the queue. Accounts are chosen there, before anything runs. */
  const stage = useCallback((files: FileList | File[]) => {
    const only = accounts.length === 1 ? accounts[0].id : ''
    const added: StagedFile[] = Array.from(files).map((file, i) => ({
      id: `${Date.now()}-${i}-${file.name}`,
      file,
      accountId: only,
      status: 'waiting',
    }))
    if (added.length === 0) return
    setStaged(prev => [...prev, ...added])
  }, [accounts])

  /** Turns one ingest response into a sentence. */
  const describe = useCallback((data: {
    applied?: number
    pending?: unknown[]
    unmatched?: string[]
    transactions?: {
      filed?: number; skipped_duplicates?: number; ai_categorised?: number
      left_uncategorised?: number; low_confidence?: number
      unresolved_account?: boolean; warning?: string | null
      proposed_rules?: unknown[]
    } | null
  }) => {
      const bits: string[] = []
      if (data.applied) bits.push(`Filed ${data.applied} balance${data.applied === 1 ? '' : 's'}.`)
      if (data.pending?.length) bits.push(`${data.pending.length} need${data.pending.length === 1 ? 's' : ''} your check below.`)
      if (data.unmatched?.length) bits.push(`No matching account name for: ${data.unmatched.join(', ')}.`)

      const tx = data.transactions
      if (tx) {
        if (tx.filed) bits.push(`Filed ${tx.filed} transaction${tx.filed === 1 ? '' : 's'}.`)
        if (tx.skipped_duplicates) bits.push(`${tx.skipped_duplicates} already on record, skipped.`)
        if (tx.ai_categorised) bits.push(`${tx.ai_categorised} categorised by me — worth checking in Transactions.`)
        if (tx.left_uncategorised) bits.push(`${tx.left_uncategorised} filed but not yet categorised — they are safe, just uncategorised.`)
        if (tx.low_confidence) bits.push(`${tx.low_confidence} transaction line(s) were unclear and not filed.`)
        if (tx.unresolved_account) {
          bits.push('Could not tell which account those transactions belong to.')
        }
        if (tx.warning) bits.push(tx.warning)
        if (tx.proposed_rules?.length) {
          bits.push(`${tx.proposed_rules.length} could become reusable rules — see the Transactions tab.`)
        }
      }
      return bits.join(' ') || 'Nothing to file from that one.'
  }, [])

  /**
   * Imports the queue one file at a time.
   *
   * Deliberately sequential. Dedupe keys are generated against what is already
   * stored, so two files for the same account running at once would each decide
   * the same transaction was new and insert it twice.
   */
  const runQueue = useCallback(async () => {
    if (uploading) return
    const queue = staged.filter(f => f.status === 'waiting' && f.accountId)
    if (queue.length === 0) return

    setUploading(true)
    const totals = { files: 0, balances: 0, transactions: 0, skipped: 0, failed: 0 }

    try {
      for (const item of queue) {
        setStaged(prev => prev.map(f => (f.id === item.id ? { ...f, status: 'importing' } : f)))
        const accountName = accounts.find(a => a.id === item.accountId)?.name ?? 'that account'

        try {
          const fd = new FormData()
          fd.append('file', item.file)
          fd.append('account_id', item.accountId)
          const res = await fetch('/api/money/ingest', { method: 'POST', body: fd })
          const data = await res.json()

          if (!res.ok) {
            totals.failed++
            setStaged(prev => prev.map(f => (f.id === item.id
              ? { ...f, status: 'failed', summary: data.error || 'Could not read that file.' }
              : f)))
            continue
          }

          totals.files++
          totals.balances += data.applied ?? 0
          totals.transactions += data.transactions?.filed ?? 0
          totals.skipped += data.transactions?.skipped_duplicates ?? 0

          setStaged(prev => prev.map(f => (f.id === item.id
            ? { ...f, status: 'done', summary: `${accountName}: ${describe(data)}` }
            : f)))

          // Balances needing review are held per file; the last one with any
          // wins the panel, which is fine — it is re-shown after each import.
          if (data.pending?.length) {
            setPending(data.pending)
            setPendingDocId(data.document_id ?? null)
          }
        } catch (err) {
          totals.failed++
          setStaged(prev => prev.map(f => (f.id === item.id
            ? { ...f, status: 'failed', summary: String(err) }
            : f)))
        }
      }

      const parts = [`Imported ${totals.files} file${totals.files === 1 ? '' : 's'}.`]
      if (totals.transactions) parts.push(`${totals.transactions} transactions filed.`)
      if (totals.balances) parts.push(`${totals.balances} balances filed.`)
      if (totals.skipped) parts.push(`${totals.skipped} already on record, skipped.`)
      if (totals.failed) parts.push(`${totals.failed} file(s) failed — see the list.`)
      say(parts.join(' '))

      setDataVersion(v => v + 1)
      router.refresh()
    } finally {
      setUploading(false)
    }
  }, [uploading, staged, accounts, describe, router])

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

  /**
   * The chat, the import queue and anything waiting on a decision.
   *
   * One definition used by both the desktop sidebar and the phone panel. A
   * staged statement has to be reachable on either, and two copies of this
   * would drift apart.
   */
  const conversation = (
    <>
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
        <ImportQueue
          staged={staged}
          accounts={accounts}
          busy={uploading}
          onSetAccount={(id, accountId) =>
            setStaged(prev => prev.map(f => (f.id === id ? { ...f, accountId } : f)))}
          onRemove={id => setStaged(prev => prev.filter(f => f.id !== id))}
          onImport={runQueue}
          onClear={() => setStaged([])}
        />
        {(loading || uploading) && (
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{uploading ? 'Importing…' : 'Thinking…'}</div>
        )}
      </div>
      <div style={{ padding: 10, borderTop: '1px solid #e5e7eb', display: 'flex', gap: 6 }}>
        <button onClick={() => fileInput.current?.click()} title="Attach a statement, screenshot or CSV"
          style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '8px 11px', cursor: 'pointer', flexShrink: 0 }}>
          📎
        </button>
        <input ref={fileInput} type="file" multiple style={{ display: 'none' }}
          accept="image/*,application/pdf,.csv,text/csv"
          onChange={e => { if (e.target.files?.length) stage(e.target.files); e.target.value = '' }} />
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void send() }}
          onPaste={e => {
            if (e.clipboardData.files.length) { e.preventDefault(); stage(e.clipboardData.files) }
          }}
          placeholder="Ask, or paste a screenshot…"
          /* 16px: iOS Safari zooms the whole page in when a focused input is
             smaller than that, and the layout never recovers. */
          style={{ flex: 1, minWidth: 0, border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 16 }}
        />
      </div>
    </>
  )

  // What is waiting on the user, for the phone toggle's badge.
  const waiting = pending.length + staged.length

  return (
    <div style={{ height: '100%', background: '#fff', color: '#111', overflow: 'hidden' }}
      className="flex flex-col md:flex-row"
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault(); setDragging(false)
        if (e.dataTransfer.files?.length) stage(e.dataTransfer.files)
      }}
    >
      {/* JARVIS sidebar - tablet and up. On a phone it took 300 of 375px and
          squeezed every table into the remaining sliver, so below md it
          becomes the collapsible panel further down. */}
      <aside className="hidden md:flex"
        style={{ width: 300, borderRight: '1px solid #e5e7eb', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', fontSize: 12, fontWeight: 700 }}>
          ◉ JARVIS
        </div>
        {conversation}
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div className="px-4 md:px-6"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0 10px', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Money</span>
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
            ◉ JARVIS{waiting > 0 ? ` · ${waiting}` : ''} {panelOpen ? '▴' : '▾'}
          </button>
        </div>

        {/* Phone JARVIS panel, in the flow rather than over the content. */}
        {panelOpen && (
          <div
            className="md:hidden"
            style={{
              borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb',
              display: 'flex', flexDirection: 'column', height: '55vh', flexShrink: 0,
            }}
          >
            {conversation}
          </div>
        )}

        {/* Six tabs need 540px. Rather than a strip you have to discover
            scrolls sideways, on a phone they are a dropdown: every section
            reachable in one tap, none of them off screen. */}
        <div className="md:hidden" style={{ borderBottom: '1px solid #e5e7eb', padding: '0 16px 10px', flexShrink: 0 }}>
          <select
            value={TABS.find(t => pathname.startsWith(t.href))?.href ?? TABS[0].href}
            onChange={e => router.push(e.target.value)}
            aria-label="Money section"
            /* 16px stops iOS Safari zooming the page on focus. */
            style={{
              width: '100%', border: '1px solid #d1d5db', borderRadius: 8,
              padding: '9px 10px', fontSize: 16, fontWeight: 600, background: '#fff', color: '#111',
            }}
          >
            {TABS.map(t => (
              <option key={t.href} value={t.href}>{t.icon}  {t.label}</option>
            ))}
          </select>
        </div>

        <nav className="hidden md:flex" style={{ gap: 4, padding: '10px 18px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
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
          <div style={{ margin: 18, padding: 20, border: '2px dashed #3b82f6', borderRadius: 12, textAlign: 'center', fontSize: 12, color: '#3b82f6', flexShrink: 0 }}>
            Drop the statement to file it
          </div>
        )}
        {/* key remounts the page so it refetches after an import.
            Bottom padding on a phone keeps the last row clear of the floating
            JARVIS orb, which otherwise sits on top of it. */}
        <div key={dataVersion} style={{ flex: 1, overflowY: 'auto' }} className="pb-20 md:pb-0">{children}</div>
      </main>
    </div>
  )
}
