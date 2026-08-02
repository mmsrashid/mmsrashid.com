'use client'
import { useCallback, useEffect, useState } from 'react'
import type { HealthAppointment } from '@/lib/health/types'

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<HealthAppointment[]>([])
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const emptyForm = { appointment_date: '', appointment_type: '', doctor_name: '', clinic_name: '', notes: '' }
  const [form, setForm] = useState(emptyForm)

  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() =>
    fetch('/api/health/appointments').then(r => r.json()).then(d => setAppointments(Array.isArray(d) ? d : [])), [])

  useEffect(() => { load() }, [load])

  async function remove(a: HealthAppointment) {
    if (!confirm(`Delete "${a.appointment_type}"? This cannot be undone.`)) return
    setBusy(a.id)
    setError('')
    try {
      const res = await fetch(`/api/health/appointments/${a.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) return setError(d.error || 'Could not delete.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    // appointment_date and appointment_type are NOT NULL in the schema.
    if (!form.appointment_date) return setError('Date is required.')
    if (!form.appointment_type.trim()) return setError('Appointment type is required.')
    const body = {
      ...form,
      doctor_name: form.doctor_name || null,
      clinic_name: form.clinic_name || null,
      notes: form.notes || null,
    }
    const res = await fetch('/api/health/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const newAppt = await res.json()
    if (!res.ok) return setError(newAppt.error || 'Could not save appointment.')
    setAppointments(a => [newAppt, ...a])
    setShowForm(false)
    setForm(emptyForm)
    setError('')
  }

  const byDate = (a: string | null, b: string | null) => (a || '').localeCompare(b || '')
  const upcoming = appointments.filter(a => a.status === 'upcoming').sort((a, b) => byDate(a.appointment_date, b.appointment_date))
  const past = appointments.filter(a => a.status !== 'upcoming').sort((a, b) => byDate(b.appointment_date, a.appointment_date))

  const badge = (status: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      upcoming: { bg: '#dbeafe', color: '#1e40af' },
      completed: { bg: '#d1fae5', color: '#065f46' },
      cancelled: { bg: '#fee2e2', color: '#991b1b' },
    }
    return map[status] ?? { bg: '#f3f4f6', color: '#6b7280' }
  }

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>Appointments</h2>
        <button onClick={() => setShowForm(true)} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>+ Add</button>
      </div>

      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>New Appointment</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {([['appointment_date', 'Date & Time', 'datetime-local'], ['appointment_type', 'Type', 'text'], ['doctor_name', 'Doctor', 'text'], ['clinic_name', 'Clinic / Hospital', 'text']] as const).map(([k, label, type]) => (
              <div key={k}>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>{label}</label>
                <input type={type} value={(form as Record<string, string>)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none' }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none', resize: 'none' }} />
          </div>
          {error && <p style={{ fontSize: 11, color: '#991b1b', background: '#fee2e2', borderRadius: 8, padding: '7px 10px', marginTop: 10 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={save} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save</button>
            <button onClick={() => { setShowForm(false); setError('') }} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {[{ title: 'Upcoming', items: upcoming }, { title: 'Past', items: past }].map(({ title, items }) => (
        <div key={title} style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{title}</p>
          {items.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af' }}>None</p>}
          {items.map(a => {
            const d = new Date(a.appointment_date)
            const b = badge(a.status)
            return (
              <div key={a.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: '#f3f4f6', borderRadius: 10, padding: '8px 12px', textAlign: 'center', flexShrink: 0, minWidth: 48 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{d.getDate()}</div>
                  <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{d.toLocaleString('default', { month: 'short' }).toUpperCase()}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{a.appointment_type}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{a.doctor_name}{a.clinic_name ? ` · ${a.clinic_name}` : ''}</div>
                  {a.notes && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>{a.notes}</div>}
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 10, background: b.bg, color: b.color, textTransform: 'capitalize' }}>{a.status}</span>
                <button
                  onClick={() => remove(a)}
                  disabled={busy === a.id}
                  style={{ fontSize: 10, color: '#991b1b', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px' }}
                >Delete</button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
