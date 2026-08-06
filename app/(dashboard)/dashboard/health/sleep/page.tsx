'use client'
import { useEffect, useState } from 'react'
import MetricTrend from '@/components/health/MetricTrend'
import type { SleepLog } from '@/lib/health/types'
import { localToday } from '@/lib/local-date'

const today = () => localToday()

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }
const field: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }
const label: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }

const empty = { sleep_date: today(), total_hours: '', quality_score: '', bedtime: '', wake_time: '', notes: '' }

export default function SleepPage() {
  const [logs, setLogs] = useState<SleepLog[]>([])
  const [form, setForm] = useState(empty)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = () =>
    fetch('/api/health/sleep').then(r => r.json()).then(d => setLogs(Array.isArray(d) ? d : []))

  useEffect(() => { load() }, [])


  async function remove(id: string, when: string) {
    if (!confirm(`Delete the ${when} night? This cannot be undone.`)) return
    setBusy(id)
    setError('')
    try {
      const res = await fetch(`/api/health/sleep/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not delete.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!form.sleep_date) return setError('A date is required.')
    const num = (v: string) => (v === '' ? null : Number(v))
    const res = await fetch('/api/health/sleep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sleep_date: form.sleep_date,
        total_hours: num(form.total_hours),
        quality_score: num(form.quality_score),
        bedtime: form.bedtime || null,
        wake_time: form.wake_time || null,
        notes: form.notes || null,
      }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not save.')
    setShowForm(false); setForm(empty); setError('')
    load()
  }

  const withHours = logs.filter(l => l.total_hours != null)
  const points = [...withHours].reverse().map(l => ({ date: l.sleep_date, value: Number(l.total_hours) }))
  const avg = withHours.length
    ? Math.round((withHours.reduce((s, l) => s + Number(l.total_hours), 0) / withHours.length) * 10) / 10
    : null
  const lastNight = logs[0]

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>Sleep</h2>
        <button onClick={() => setShowForm(s => !s)} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          {showForm ? 'Close' : '+ Log sleep'}
        </button>
      </div>

      {showForm && (
        <div style={card}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Log a night</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div><span style={label}>date</span><input style={field} type="date" value={form.sleep_date} onChange={e => setForm(f => ({ ...f, sleep_date: e.target.value }))} /></div>
            <div><span style={label}>hours slept</span><input style={field} type="number" step="0.1" placeholder="7.5" value={form.total_hours} onChange={e => setForm(f => ({ ...f, total_hours: e.target.value }))} /></div>
            <div><span style={label}>quality (0–100)</span><input style={field} type="number" min="0" max="100" placeholder="82" value={form.quality_score} onChange={e => setForm(f => ({ ...f, quality_score: e.target.value }))} /></div>
            <div><span style={label}>bedtime</span><input style={field} type="time" value={form.bedtime} onChange={e => setForm(f => ({ ...f, bedtime: e.target.value }))} /></div>
            <div><span style={label}>wake time</span><input style={field} type="time" value={form.wake_time} onChange={e => setForm(f => ({ ...f, wake_time: e.target.value }))} /></div>
            <div><span style={label}>notes</span><input style={field} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          {error && <p style={{ fontSize: 11, color: '#991b1b', background: '#fee2e2', borderRadius: 8, padding: '7px 10px', marginTop: 10 }}>{error}</p>}
          <div style={{ marginTop: 12 }}>
            <button onClick={save} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Last night', value: lastNight?.total_hours != null ? `${lastNight.total_hours} h` : '—' },
          { label: `Average (${withHours.length} night${withHours.length === 1 ? '' : 's'})`, value: avg != null ? `${avg} h` : '—' },
          { label: 'Last quality score', value: lastNight?.quality_score != null ? `${lastNight.quality_score}/100` : '—' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Hours slept <span style={{ fontWeight: 400, color: '#9ca3af' }}>· dashed line is an 8-hour target</span></h3>
        <MetricTrend points={points} unit="hours" colour="#6366f1" target={8} />
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Recent nights</h3>
        {logs.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af' }}>Nothing logged yet.</p>}
        {logs.map(l => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: '1px solid #f3f4f6', fontSize: 12 }}>
            <span style={{ minWidth: 90, fontWeight: 600 }}>{l.sleep_date}</span>
            <span style={{ minWidth: 60 }}>{l.total_hours != null ? `${l.total_hours} h` : '—'}</span>
            <span style={{ minWidth: 70, color: '#6b7280' }}>{l.quality_score != null ? `${l.quality_score}/100` : ''}</span>
            <span style={{ minWidth: 110, color: '#6b7280' }}>{l.bedtime && l.wake_time ? `${l.bedtime.slice(0, 5)} → ${l.wake_time.slice(0, 5)}` : ''}</span>
            <span style={{ color: '#9ca3af', flex: 1 }}>{l.notes ?? ''}</span>
            <button onClick={() => remove(l.id, l.sleep_date)} disabled={busy === l.id}
              style={{ fontSize: 10, color: '#991b1b', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px' }}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}
