'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import PendingReview from './PendingReview'
import type { ExtractedBalance, MoneyAccount } from '@/lib/money/types'

const TABS = [
  { label: 'Overview', icon: '📊', href: '/dashboard/money/overview' },
  { label: 'Spending', icon: '🧾', href: '/dashboard/money/spending' },
  { label: 'Transactions', icon: '📃', href: '/dashboard/money/transactions' },
  { label: 'Property', icon: '🏘️', href: '/dashboard/money/property' },
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
  // Which account an uploaded statement belongs to. A file cannot always say —
  // a Starling feed names no account at all — and without a way to choose,
  // "I could not tell which account" was a dead end: the only advice was to
  // re-upload, which failed identically.
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [uploadAccountId, setUploadAccountId] = useState('')
  // Bumping this remounts the tab subtree so its useEffect refetches.
  const [dataVersion, setDataVersion] = useState(0)

  const fileInput = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, uploading, pending.length])

  useEffect(() => {
    fetch('/api/money/accounts')
      .then(r => r.json())
      .then(d => {
        const live = Array.isArray(d) ? d.filter((a: MoneyAccount) => a.status === 'active') : []
        setAccounts(live)
        // With exactly one account there is nothing to choose.
        if (live.length === 1) setUploadAccountId(live[0].id)
      })
      .catch(() => setAccounts([]))
  }, [dataVersion])

  const say = (text: string) => setMessages(m => [...m, { role: 'ai', text }])

  const upload = useCallback(async (file: File) => {
    if (uploading) return
    setUploading(true)
    setMessages(m => [...m, { role: 'user', text: `📎 ${file.name || 'screenshot'}` }])
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (uploadAccountId) fd.append('account_id', uploadAccountId)
      const res = await fetch('/api/money/ingest', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { say(data.error || 'I could not read that file.'); return }

      const bits: string[] = []
      if (data.applied) bits.push(`Filed ${data.applied} balance${data.applied === 1 ? '' : 's'}.`)
      if (data.pending?.length) bits.push(`${data.pending.length} need${data.pending.length === 1 ? 's' : ''} your check below.`)
      if (data.unmatched?.length) bits.push(`No matching account for: ${data.unmatched.join(', ')}. Add the account, then re-upload.`)

      const tx = data.transactions
      if (tx) {
        if (tx.filed) bits.push(`Filed ${tx.filed} transaction${tx.filed === 1 ? '' : 's'}.`)
        if (tx.skipped_duplicates) bits.push(`${tx.skipped_duplicates} already on record, skipped.`)
        if (tx.ai_categorised) bits.push(`${tx.ai_categorised} categorised by me — worth checking in Transactions.`)
        if (tx.left_uncategorised) bits.push(`${tx.left_uncategorised} filed but not yet categorised — they are safe, just uncategorised.`)
        if (tx.low_confidence) bits.push(`${tx.low_confidence} transaction line(s) were unclear and not filed.`)
        if (tx.unresolved_account) {
          bits.push(
            accounts.length > 1
              ? 'I could not tell which account those transactions belong to. Pick one in "File uploads into" above and drop the file again.'
              : 'I could not tell which account those transactions belong to. Add the account first, then re-upload.',
          )
        }
        if (tx.warning) bits.push(tx.warning)
        // Offering the rules is what turns a one-off AI guess into a permanent,
        // deterministic decision the user controls.
        if (tx.proposed_rules?.length) {
          bits.push(`I can turn ${tx.proposed_rules.length} of those into reusable rules from the Transactions tab.`)
        }
      }
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
  }, [uploading, router, uploadAccountId])

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
        {accounts.length > 1 && (
          <div style={{ padding: '8px 10px 0', borderTop: '1px solid #e5e7eb' }}>
            <label style={{ fontSize: 10, color: '#6b7280', display: 'block', marginBottom: 3 }}>
              File uploads into
            </label>
            <select
              value={uploadAccountId}
              onChange={e => setUploadAccountId(e.target.value)}
              style={{
                width: '100%', border: '1px solid #d1d5db', borderRadius: 8,
                padding: '5px 8px', fontSize: 11,
                borderColor: uploadAccountId ? '#d1d5db' : '#fbbf24',
              }}
            >
              <option value="">— work it out from the file —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ padding: 10, borderTop: accounts.length > 1 ? 'none' : '1px solid #e5e7eb', display: 'flex', gap: 6 }}>
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
