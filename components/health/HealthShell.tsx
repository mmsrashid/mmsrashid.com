'use client'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const TABS = [
  { label: 'Home', icon: '🏠', href: '/dashboard/health/home' },
  { label: 'Appointments', icon: '📅', href: '/dashboard/health/appointments' },
  { label: 'Messages', icon: '💬', href: '/dashboard/health/messages' },
  { label: 'Medicines', icon: '💊', href: '/dashboard/health/medicines' },
  { label: 'Test Results', icon: '🩸', href: '/dashboard/health/blood' },
  { label: 'Documents', icon: '📄', href: '/dashboard/health/documents' },
]

interface Props { children: React.ReactNode }

export default function HealthShell({ children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [messages, setMessages] = useState([
    { role: 'ai', text: "Good day. I'm JARVIS, your health assistant. Ask me about any of your records." }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', text: userMsg }])
    setLoading(true)
    try {
      const res = await fetch('/api/jarvis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, context: 'health' }),
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

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* JARVIS sidebar */}
      <div style={{
        width: sidebarOpen ? 270 : 44,
        background: '#111',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'width .2s',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 12px', borderBottom: '1px solid #1f2937' }}>
          {sidebarOpen && <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>◉ &nbsp;JARVIS</span>}
          <button onClick={() => setSidebarOpen(o => !o)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 }}>
            {sidebarOpen ? '←' : '→'}
          </button>
        </div>
        {sidebarOpen && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {messages.map((m, i) => (
                <div key={i} style={{
                  fontSize: 11, lineHeight: 1.5, padding: '7px 9px', borderRadius: 10, maxWidth: '95%',
                  background: m.role === 'ai' ? '#1d4ed8' : '#1f2937',
                  color: m.role === 'ai' ? '#fff' : '#d1d5db',
                  alignSelf: m.role === 'ai' ? 'flex-start' : 'flex-end',
                }}>
                  {m.text || (loading && m.role === 'ai' ? '…' : '')}
                </div>
              ))}
            </div>
            <div style={{ padding: 8, borderTop: '1px solid #1f2937' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder="Ask about your health…"
                style={{ width: '100%', background: '#1f2937', border: 'none', borderRadius: 8, padding: '7px 10px', color: '#fff', fontSize: 11, outline: 'none' }}
              />
            </div>
          </>
        )}
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 20px', display: 'flex', alignItems: 'center', height: 50, flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Health Records</span>
        </div>
        {/* Tab nav */}
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
        {/* Page content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
