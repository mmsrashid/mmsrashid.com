'use client'
import { useEffect, useState } from 'react'
import type { HealthMedicine } from '@/lib/health/types'

/** Extracted names often already carry the title, so don't double it up. */
function withTitle(name: string) {
  return /^(dr|prof|mr|mrs|ms|miss)\b\.?/i.test(name.trim()) ? name.trim() : `Dr ${name.trim()}`
}

export default function MedicinesPage() {
  const [medicines, setMedicines] = useState<HealthMedicine[]>([])
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const emptyForm = { name: '', dose: '', dose_unit: 'mg', frequency: '', route: 'oral', start_date: '', prescribing_doctor: '', notes: '' }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    fetch('/api/health/medicines').then(r => r.json()).then(d => setMedicines(Array.isArray(d) ? d : []))
  }, [])

  async function save() {
    if (!form.name.trim()) return setError('Name is required.')
    // Blank optional fields must be null — Postgres rejects '' for date/numeric columns.
    const body = {
      ...form,
      dose: form.dose ? parseFloat(form.dose) : null,
      start_date: form.start_date || null,
      frequency: form.frequency || null,
      prescribing_doctor: form.prescribing_doctor || null,
      notes: form.notes || null,
    }
    const res = await fetch('/api/health/medicines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const m = await res.json()
    if (!res.ok) return setError(m.error || 'Could not save medicine.')
    setMedicines(ms => [m, ...ms])
    setShowForm(false)
    setForm(emptyForm)
    setError('')
  }

  const active = medicines.filter(m => m.status === 'active')
  const stopped = medicines.filter(m => m.status === 'stopped')

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>Medicines</h2>
        <button onClick={() => setShowForm(true)} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>+ Add</button>
      </div>

      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>New Medicine</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {(['name', 'dose', 'dose_unit', 'frequency', 'route', 'start_date', 'prescribing_doctor'] as const).map(k => (
              <div key={k}>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>{k.replace('_', ' ')}</label>
                <input value={(form as Record<string, string>)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} type={k === 'start_date' ? 'date' : k === 'dose' ? 'number' : 'text'} style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }} />
              </div>
            ))}
          </div>
          {error && <p style={{ fontSize: 11, color: '#991b1b', background: '#fee2e2', borderRadius: 8, padding: '7px 10px', marginTop: 10 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={save} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save</button>
            <button onClick={() => { setShowForm(false); setError('') }} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {[{ title: 'Active', items: active }, { title: 'Stopped', items: stopped }].map(({ title, items }) => (
        <div key={title} style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{title}</p>
          {items.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af' }}>None</p>}
          {items.map(m => (
            <div key={m.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>💊</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{m.name}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{m.dose}{m.dose_unit} · {m.frequency} · {m.route}</div>
                {m.prescribing_doctor && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{withTitle(m.prescribing_doctor)}</div>}
              </div>
              <span style={{ fontSize: 9, fontWeight: 600, padding: '3px 9px', borderRadius: 10, background: m.status === 'active' ? '#d1fae5' : '#f3f4f6', color: m.status === 'active' ? '#065f46' : '#6b7280' }}>{m.status === 'active' ? 'Active' : 'Stopped'}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
