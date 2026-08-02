'use client'
import { useEffect, useState } from 'react'
import MetricTrend from '@/components/health/MetricTrend'
import type { NutritionLog } from '@/lib/health/types'

const today = () => new Date().toISOString().slice(0, 10)

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }
const field: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }
const label: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }

const empty = { log_date: today(), calories: '', protein_g: '', carbs_g: '', fat_g: '', water_ml: '', notes: '' }

type Metric = 'calories' | 'protein_g' | 'water_ml'
const METRICS: { key: Metric; label: string; unit: string; colour: string }[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal', colour: '#f97316' },
  { key: 'protein_g', label: 'Protein', unit: 'g', colour: '#0ea5e9' },
  { key: 'water_ml', label: 'Water', unit: 'ml', colour: '#06b6d4' },
]

export default function NutritionPage() {
  const [logs, setLogs] = useState<NutritionLog[]>([])
  const [form, setForm] = useState(empty)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [metric, setMetric] = useState<Metric>('calories')

  const load = () =>
    fetch('/api/health/nutrition').then(r => r.json()).then(d => setLogs(Array.isArray(d) ? d : []))

  useEffect(() => { load() }, [])


  async function remove(id: string, when: string) {
    if (!confirm(`Delete the ${when} day? This cannot be undone.`)) return
    setBusy(id)
    setError('')
    try {
      const res = await fetch(`/api/health/nutrition/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not delete.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!form.log_date) return setError('A date is required.')
    const num = (v: string) => (v === '' ? null : Number(v))
    const res = await fetch('/api/health/nutrition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        log_date: form.log_date,
        calories: num(form.calories),
        protein_g: num(form.protein_g),
        carbs_g: num(form.carbs_g),
        fat_g: num(form.fat_g),
        water_ml: num(form.water_ml),
        notes: form.notes || null,
      }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not save.')
    setShowForm(false); setForm(empty); setError('')
    load()
  }

  const active = METRICS.find(m => m.key === metric)!
  const points = [...logs]
    .filter(l => l[metric] != null)
    .reverse()
    .map(l => ({ date: l.log_date, value: Number(l[metric]) }))

  const todayLog = logs.find(l => l.log_date === today())

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>Nutrition</h2>
        <button onClick={() => setShowForm(s => !s)} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          {showForm ? 'Close' : '+ Log a day'}
        </button>
      </div>

      {showForm && (
        <div style={card}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Daily totals</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div><span style={label}>date</span><input style={field} type="date" value={form.log_date} onChange={e => setForm(f => ({ ...f, log_date: e.target.value }))} /></div>
            <div><span style={label}>calories (kcal)</span><input style={field} type="number" placeholder="2200" value={form.calories} onChange={e => setForm(f => ({ ...f, calories: e.target.value }))} /></div>
            <div><span style={label}>water (ml)</span><input style={field} type="number" placeholder="2500" value={form.water_ml} onChange={e => setForm(f => ({ ...f, water_ml: e.target.value }))} /></div>
            <div><span style={label}>protein (g)</span><input style={field} type="number" step="0.1" placeholder="140" value={form.protein_g} onChange={e => setForm(f => ({ ...f, protein_g: e.target.value }))} /></div>
            <div><span style={label}>carbs (g)</span><input style={field} type="number" step="0.1" placeholder="220" value={form.carbs_g} onChange={e => setForm(f => ({ ...f, carbs_g: e.target.value }))} /></div>
            <div><span style={label}>fat (g)</span><input style={field} type="number" step="0.1" placeholder="70" value={form.fat_g} onChange={e => setForm(f => ({ ...f, fat_g: e.target.value }))} /></div>
            <div style={{ gridColumn: '1 / -1' }}><span style={label}>notes</span><input style={field} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          {error && <p style={{ fontSize: 11, color: '#991b1b', background: '#fee2e2', borderRadius: 8, padding: '7px 10px', marginTop: 10 }}>{error}</p>}
          <div style={{ marginTop: 12 }}>
            <button onClick={save} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Calories today', value: todayLog?.calories != null ? `${todayLog.calories}` : '—' },
          { label: 'Protein today', value: todayLog?.protein_g != null ? `${todayLog.protein_g} g` : '—' },
          { label: 'Water today', value: todayLog?.water_ml != null ? `${todayLog.water_ml} ml` : '—' },
          { label: 'Days logged', value: `${logs.length}` },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Trend</h3>
          {METRICS.map(m => (
            <button key={m.key} onClick={() => setMetric(m.key)} style={{
              border: '1px solid #e5e7eb', borderRadius: 8, padding: '4px 10px', fontSize: 10, cursor: 'pointer',
              background: metric === m.key ? '#111' : '#fff', color: metric === m.key ? '#fff' : '#374151', fontWeight: 600,
            }}>{m.label}</button>
          ))}
        </div>
        <MetricTrend points={points} unit={active.unit} colour={active.colour} />
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Recent days</h3>
        {logs.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af' }}>Nothing logged yet.</p>}
        {logs.map(l => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: '1px solid #f3f4f6', fontSize: 12 }}>
            <span style={{ minWidth: 90, fontWeight: 600 }}>{l.log_date}</span>
            <span style={{ minWidth: 80 }}>{l.calories != null ? `${l.calories} kcal` : '—'}</span>
            <span style={{ minWidth: 110, color: '#6b7280' }}>
              {[l.protein_g != null ? `P ${l.protein_g}` : null, l.carbs_g != null ? `C ${l.carbs_g}` : null, l.fat_g != null ? `F ${l.fat_g}` : null].filter(Boolean).join(' · ')}
            </span>
            <span style={{ minWidth: 80, color: '#6b7280' }}>{l.water_ml != null ? `${l.water_ml} ml` : ''}</span>
            <span style={{ color: '#9ca3af', flex: 1 }}>{l.notes ?? ''}</span>
            <button onClick={() => remove(l.id, l.log_date)} disabled={busy === l.id}
              style={{ fontSize: 10, color: '#991b1b', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px' }}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}
