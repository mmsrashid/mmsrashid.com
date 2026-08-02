'use client'
import { useEffect, useState } from 'react'
import MetricTrend from '@/components/health/MetricTrend'
import { INTENSITIES, type ExerciseLog } from '@/lib/health/types'

const today = () => new Date().toISOString().slice(0, 10)

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }
const field: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }
const label: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }

const INTENSITY_STYLE: Record<string, { bg: string; color: string }> = {
  low: { bg: '#dbeafe', color: '#1e40af' },
  moderate: { bg: '#fef3c7', color: '#92400e' },
  high: { bg: '#fee2e2', color: '#991b1b' },
}

const empty = {
  exercise_date: today(), activity_type: '', duration_min: '',
  intensity: 'moderate', distance_km: '', avg_heart_rate: '', notes: '',
}

export default function ExercisePage() {
  const [logs, setLogs] = useState<ExerciseLog[]>([])
  const [form, setForm] = useState(empty)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = () =>
    fetch('/api/health/exercise').then(r => r.json()).then(d => setLogs(Array.isArray(d) ? d : []))

  useEffect(() => { load() }, [])


  async function remove(id: string, when: string) {
    if (!confirm(`Delete the ${when} session? This cannot be undone.`)) return
    setBusy(id)
    setError('')
    try {
      const res = await fetch(`/api/health/exercise/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not delete.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!form.exercise_date) return setError('A date is required.')
    if (!form.activity_type.trim()) return setError('An activity is required.')
    const num = (v: string) => (v === '' ? null : Number(v))
    const res = await fetch('/api/health/exercise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exercise_date: form.exercise_date,
        activity_type: form.activity_type.trim(),
        duration_min: num(form.duration_min),
        intensity: form.intensity || null,
        distance_km: num(form.distance_km),
        avg_heart_rate: num(form.avg_heart_rate),
        notes: form.notes || null,
      }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not save.')
    setShowForm(false); setForm(empty); setError('')
    load()
  }

  // Several sessions can share a date, so total minutes per day.
  const byDate = new Map<string, number>()
  for (const l of logs) {
    if (l.duration_min == null) continue
    byDate.set(l.exercise_date, (byDate.get(l.exercise_date) ?? 0) + Number(l.duration_min))
  }
  const points = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value }))

  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const thisWeek = logs.filter(l => l.exercise_date >= weekAgo.toISOString().slice(0, 10))
  const weekMinutes = thisWeek.reduce((s, l) => s + Number(l.duration_min ?? 0), 0)

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>Exercise</h2>
        <button onClick={() => setShowForm(s => !s)} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          {showForm ? 'Close' : '+ Log a session'}
        </button>
      </div>

      {showForm && (
        <div style={card}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>New session</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div><span style={label}>date</span><input style={field} type="date" value={form.exercise_date} onChange={e => setForm(f => ({ ...f, exercise_date: e.target.value }))} /></div>
            <div><span style={label}>activity</span><input style={field} placeholder="Running" value={form.activity_type} onChange={e => setForm(f => ({ ...f, activity_type: e.target.value }))} /></div>
            <div><span style={label}>duration (min)</span><input style={field} type="number" placeholder="45" value={form.duration_min} onChange={e => setForm(f => ({ ...f, duration_min: e.target.value }))} /></div>
            <div>
              <span style={label}>intensity</span>
              <select style={field} value={form.intensity} onChange={e => setForm(f => ({ ...f, intensity: e.target.value }))}>
                {INTENSITIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div><span style={label}>distance (km)</span><input style={field} type="number" step="0.01" placeholder="8.2" value={form.distance_km} onChange={e => setForm(f => ({ ...f, distance_km: e.target.value }))} /></div>
            <div><span style={label}>avg heart rate</span><input style={field} type="number" placeholder="148" value={form.avg_heart_rate} onChange={e => setForm(f => ({ ...f, avg_heart_rate: e.target.value }))} /></div>
            <div style={{ gridColumn: '1 / -1' }}><span style={label}>notes</span><input style={field} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          {error && <p style={{ fontSize: 11, color: '#991b1b', background: '#fee2e2', borderRadius: 8, padding: '7px 10px', marginTop: 10 }}>{error}</p>}
          <div style={{ marginTop: 12 }}>
            <button onClick={save} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Sessions this week', value: `${thisWeek.length}` },
          { label: 'Minutes this week', value: `${weekMinutes}` },
          { label: 'Sessions logged', value: `${logs.length}` },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Minutes per day</h3>
        <MetricTrend points={points} unit="minutes" colour="#059669" />
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Recent sessions</h3>
        {logs.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af' }}>Nothing logged yet.</p>}
        {logs.map(l => {
          const si = l.intensity ? INTENSITY_STYLE[l.intensity] : null
          return (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: '1px solid #f3f4f6', fontSize: 12 }}>
              <span style={{ minWidth: 90, fontWeight: 600 }}>{l.exercise_date}</span>
              <span style={{ minWidth: 110 }}>{l.activity_type}</span>
              <span style={{ minWidth: 60, color: '#6b7280' }}>{l.duration_min != null ? `${l.duration_min} min` : ''}</span>
              {si
                ? <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: si.bg, color: si.color }}>{l.intensity}</span>
                : <span style={{ minWidth: 56 }} />}
              <span style={{ minWidth: 70, color: '#6b7280' }}>{l.distance_km != null ? `${l.distance_km} km` : ''}</span>
              <span style={{ minWidth: 60, color: '#6b7280' }}>{l.avg_heart_rate != null ? `${l.avg_heart_rate} bpm` : ''}</span>
              <span style={{ color: '#9ca3af', flex: 1 }}>{l.notes ?? ''}</span>
              <button onClick={() => remove(l.id, `${l.exercise_date} ${l.activity_type}`)} disabled={busy === l.id}
                style={{ fontSize: 10, color: '#991b1b', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px' }}>Delete</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
