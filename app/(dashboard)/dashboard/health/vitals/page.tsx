'use client'
import { useCallback, useEffect, useState } from 'react'
import BloodPressureTrend from '@/components/health/BloodPressureTrend'
import MetricTrend from '@/components/health/MetricTrend'
import type { VitalReading } from '@/lib/health/types'

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }
const field: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }
const label: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }

const nowLocal = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const SOURCE_STYLE: Record<string, { bg: string; color: string }> = {
  manual: { bg: '#f3f4f6', color: '#374151' },
  device: { bg: '#dbeafe', color: '#1e40af' },
  clinic: { bg: '#fef3c7', color: '#92400e' },
  import: { bg: '#ede9fe', color: '#5b21b6' },
}

export default function VitalsPage() {
  const [rows, setRows] = useState<VitalReading[]>([])
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const empty = { measured_at: nowLocal(), systolic: '', diastolic: '', heart_rate: '', notes: '' }
  const [form, setForm] = useState(empty)

  const load = useCallback(() =>
    fetch('/api/health/vitals')
      .then(r => r.json())
      .then(d => { setRows(Array.isArray(d) ? d : []); setLoaded(true) })
      .catch(() => setLoaded(true)), [])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.measured_at) return setError('A date and time is required.')
    const res = await fetch('/api/health/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        measured_at: form.measured_at,
        systolic: form.systolic || null,
        diastolic: form.diastolic || null,
        heart_rate: form.heart_rate || null,
        notes: form.notes || null,
        source: 'manual',
      }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not save.')
    setShowForm(false); setForm({ ...empty, measured_at: nowLocal() }); setError('')
    load()
  }

  async function remove(r: VitalReading) {
    const when = new Date(r.measured_at).toLocaleString('en-GB')
    if (!confirm(`Delete the reading from ${when}? This cannot be undone.`)) return
    setBusy(r.id)
    setError('')
    try {
      const res = await fetch(`/api/health/vitals/${r.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not delete.')
      await load()
    } finally { setBusy(null) }
  }

  const bp = rows.filter(r => r.systolic != null && r.diastolic != null)
    .map(r => ({ at: r.measured_at, systolic: r.systolic!, diastolic: r.diastolic! }))
  const hr = rows.filter(r => r.heart_rate != null)
    .map(r => ({ date: r.measured_at, value: r.heart_rate! }))

  const latestBp = [...bp].reverse()[0]
  const latestHr = [...hr].reverse()[0]
  const avgSys = bp.length ? Math.round(bp.reduce((s, p) => s + p.systolic, 0) / bp.length) : null
  const avgDia = bp.length ? Math.round(bp.reduce((s, p) => s + p.diastolic, 0) / bp.length) : null

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>Vitals</h2>
        <button onClick={() => setShowForm(s => !s)} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          {showForm ? 'Close' : '+ Add reading'}
        </button>
      </div>

      {showForm && (
        <div style={card}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>New reading</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <div style={{ gridColumn: 'span 2' }}><span style={label}>date &amp; time</span>
              <input style={field} type="datetime-local" value={form.measured_at} onChange={e => setForm(f => ({ ...f, measured_at: e.target.value }))} /></div>
            <div><span style={label}>systolic</span>
              <input style={field} type="number" placeholder="118" value={form.systolic} onChange={e => setForm(f => ({ ...f, systolic: e.target.value }))} /></div>
            <div><span style={label}>diastolic</span>
              <input style={field} type="number" placeholder="76" value={form.diastolic} onChange={e => setForm(f => ({ ...f, diastolic: e.target.value }))} /></div>
            <div><span style={label}>heart rate (bpm)</span>
              <input style={field} type="number" placeholder="68" value={form.heart_rate} onChange={e => setForm(f => ({ ...f, heart_rate: e.target.value }))} /></div>
            <div style={{ gridColumn: 'span 3' }}><span style={label}>notes</span>
              <input style={field} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          {error && <p style={{ fontSize: 11, color: '#991b1b', background: '#fee2e2', borderRadius: 8, padding: '7px 10px', marginTop: 10 }}>{error}</p>}
          <div style={{ marginTop: 12 }}>
            <button onClick={save} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Latest BP', value: latestBp ? `${latestBp.systolic}/${latestBp.diastolic}` : '—' },
          { label: 'Average BP', value: avgSys != null ? `${avgSys}/${avgDia}` : '—' },
          { label: 'Latest heart rate', value: latestHr ? `${latestHr.value} bpm` : '—' },
          { label: 'Readings', value: `${rows.length}` },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Blood pressure</h3>
        <BloodPressureTrend points={bp} />
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Heart rate</h3>
        <MetricTrend points={hr} unit="bpm" colour="#7c3aed" />
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Recent readings</h3>
        {!loaded && <p style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</p>}
        {loaded && rows.length === 0 && (
          <p style={{ fontSize: 12, color: '#9ca3af' }}>
            Nothing recorded yet. Add a reading above, or ask JARVIS to file a blood pressure from a photo.
          </p>
        )}
        {[...rows].reverse().map(r => {
          const ss = SOURCE_STYLE[r.source] ?? SOURCE_STYLE.manual!
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: '1px solid #f3f4f6', fontSize: 12 }}>
              <span style={{ minWidth: 130, fontWeight: 600 }}>{new Date(r.measured_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <span style={{ minWidth: 70 }}>{r.systolic != null ? `${r.systolic}/${r.diastolic}` : '—'}</span>
              <span style={{ minWidth: 70, color: '#6b7280' }}>{r.heart_rate != null ? `${r.heart_rate} bpm` : ''}</span>
              <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: ss.bg, color: ss.color }}>{r.source}</span>
              <span style={{ color: '#9ca3af', flex: 1 }}>{r.notes ?? ''}</span>
              <button onClick={() => remove(r)} disabled={busy === r.id}
                style={{ fontSize: 10, color: '#991b1b', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px' }}>Delete</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
