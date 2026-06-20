'use client'

import { useState, useEffect, useCallback } from 'react'
import type { EmailMessage, EmailDetail } from '@/lib/email'

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (diffDays < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
  return (
    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600 flex-shrink-0">
      {initials}
    </div>
  )
}

interface ComposeModalProps {
  replyTo?: EmailDetail | null
  onClose: () => void
  onSent: () => void
}

function ComposeModal({ replyTo, onClose, onSent }: ComposeModalProps) {
  const [to, setTo] = useState(replyTo?.replyTo || '')
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject.replace(/^Re:\s*/i, '')}` : '')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function handleSend() {
    if (!to.trim() || !subject.trim() || !text.trim()) {
      setError('Fill in all fields.')
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim(),
          text: text.trim(),
          ...(replyTo?.messageId ? { inReplyTo: replyTo.messageId } : {}),
          ...(replyTo?.references ? { references: `${replyTo.references} ${replyTo.messageId}` } : replyTo?.messageId ? { references: replyTo.messageId } : {}),
        }),
      })
      if (!res.ok) throw new Error('Send failed')
      onSent()
      onClose()
    } catch {
      setError('Failed to send. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-6 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 rounded-t-xl">
          <span className="text-sm font-semibold text-gray-800">{replyTo ? 'Reply' : 'New Message'}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
        </div>
        <div className="flex flex-col gap-0 border-b border-gray-100">
          <div className="flex items-center px-4 py-2 border-b border-gray-100">
            <span className="text-xs text-gray-400 w-14">To</span>
            <input
              value={to}
              onChange={e => setTo(e.target.value)}
              className="flex-1 text-sm text-gray-900 outline-none"
              placeholder="recipient@example.com"
            />
          </div>
          <div className="flex items-center px-4 py-2">
            <span className="text-xs text-gray-400 w-14">Subject</span>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="flex-1 text-sm text-gray-900 outline-none"
              placeholder="Subject"
            />
          </div>
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          className="flex-1 px-4 py-3 text-sm text-gray-900 outline-none resize-none min-h-48"
          placeholder={replyTo ? `Reply to ${replyTo.fromName}…` : 'Write your message…'}
        />
        {replyTo && (
          <div className="px-4 pb-2 text-xs text-gray-400 border-t border-gray-50 pt-2">
            <div className="text-gray-300">— Original message from {replyTo.fromName} —</div>
            <div className="mt-1 text-gray-400 line-clamp-2">{replyTo.text || ''}</div>
          </div>
        )}
        {error && <p className="px-4 pb-2 text-xs text-red-500">{error}</p>}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-900">Discard</button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EmailInbox() {
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<EmailDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [composing, setComposing] = useState(false)
  const [replyingTo, setReplyingTo] = useState<EmailDetail | null>(null)
  const [sentToast, setSentToast] = useState(false)

  const fetchMessages = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/email/messages')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setMessages(data.messages || [])
    } catch {
      setError('Could not load inbox. Check IMAP credentials.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMessages() }, [fetchMessages])

  async function selectMessage(msg: EmailMessage) {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/email/messages/${msg.uid}`)
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setSelected(data.message)
      // Mark as seen locally
      setMessages(prev => prev.map(m => m.uid === msg.uid ? { ...m, seen: true } : m))
    } catch {
      // silently fail — detail just won't show
    } finally {
      setLoadingDetail(false)
    }
  }

  async function handleArchive(uid: number) {
    await fetch(`/api/email/messages/${uid}/archive`, { method: 'POST' })
    setMessages(prev => prev.filter(m => m.uid !== uid))
    if (selected?.uid === uid) setSelected(null)
  }

  async function handleDelete(uid: number) {
    await fetch(`/api/email/messages/${uid}/delete`, { method: 'DELETE' })
    setMessages(prev => prev.filter(m => m.uid !== uid))
    if (selected?.uid === uid) setSelected(null)
  }

  function handleSent() {
    setSentToast(true)
    setTimeout(() => setSentToast(false), 3000)
  }

  const unread = messages.filter(m => !m.seen).length

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900">Inbox</h1>
          {unread > 0 && (
            <span className="text-xs bg-gray-900 text-white px-2 py-0.5 rounded-full">{unread}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchMessages}
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={() => { setComposing(true); setReplyingTo(null) }}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Compose
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Message list */}
        <div className="w-80 flex-shrink-0 border-r border-gray-100 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">
              Loading…
            </div>
          )}
          {error && (
            <div className="p-6 text-sm text-red-500">{error}</div>
          )}
          {!loading && !error && messages.length === 0 && (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">
              No messages
            </div>
          )}
          {!loading && messages.map(msg => (
            <button
              key={msg.uid}
              onClick={() => selectMessage(msg)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                selected?.uid === msg.uid ? 'bg-gray-50' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 pt-0.5">
                  <Avatar name={msg.fromName} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span className={`text-sm truncate ${msg.seen ? 'text-gray-600 font-normal' : 'text-gray-900 font-semibold'}`}>
                      {msg.fromName}
                    </span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(msg.date)}</span>
                  </div>
                  <div className={`text-sm truncate mb-0.5 ${msg.seen ? 'text-gray-500' : 'text-gray-800 font-medium'}`}>
                    {msg.subject}
                  </div>
                  <div className="text-xs text-gray-400 truncate">{msg.preview}</div>
                </div>
                {!msg.seen && (
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Message detail */}
        <div className="flex-1 overflow-y-auto">
          {loadingDetail && (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">
              Loading message…
            </div>
          )}
          {!loadingDetail && !selected && (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">
              Select a message to read
            </div>
          )}
          {!loadingDetail && selected && (
            <div className="max-w-2xl mx-auto px-8 py-8">
              {/* Header */}
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">{selected.subject}</h2>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Avatar name={selected.fromName} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{selected.fromName}</p>
                      <p className="text-xs text-gray-400">{selected.from}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        To: {selected.to} · {new Date(selected.date).toLocaleString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => { setReplyingTo(selected); setComposing(true) }}
                      className="px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded-lg hover:border-gray-400 transition-colors"
                    >
                      Reply
                    </button>
                    <button
                      onClick={() => handleArchive(selected.uid)}
                      className="px-3 py-1.5 text-xs border border-gray-200 text-gray-700 rounded-lg hover:border-gray-400 transition-colors"
                    >
                      Archive
                    </button>
                    <button
                      onClick={() => handleDelete(selected.uid)}
                      className="px-3 py-1.5 text-xs border border-red-100 text-red-500 rounded-lg hover:border-red-300 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-6">
                {selected.html ? (
                  <div
                    className="prose prose-sm max-w-none text-gray-700"
                    dangerouslySetInnerHTML={{ __html: selected.html }}
                  />
                ) : (
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                    {selected.text}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compose/Reply modal */}
      {composing && (
        <ComposeModal
          replyTo={replyingTo}
          onClose={() => { setComposing(false); setReplyingTo(null) }}
          onSent={handleSent}
        />
      )}

      {/* Sent toast */}
      {sentToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          Message sent
        </div>
      )}
    </div>
  )
}
