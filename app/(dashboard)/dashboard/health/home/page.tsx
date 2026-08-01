'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { HealthAppointment, HealthMedicine, BloodMarkerWithResults } from '@/lib/health/types'

export default function HealthHomePage() {
  const router = useRouter()
  const [appointments, setAppointments] = useState<HealthAppointment[]>([])
  const [medicines, setMedicines] = useState<HealthMedicine[]>([])
  const [markers, setMarkers] = useState<BloodMarkerWithResults[]>([])
  const [messages, setMessages] = useState<{ from?: string; subject?: string; date?: string }[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/health/appointments').then(r => r.json()),
      fetch('/api/health/medicines').then(r => r.json()),
      fetch('/api/health/blood/markers').then(r => r.json()),
      fetch('/api/health/messages').then(r => r.json()),
    ]).then(([appts, meds, mkrs, msgs]) => {
      setAppointments(Array.isArray(appts) ? appts : [])
      setMedicines(Array.isArray(meds) ? meds : [])
      setMarkers(Array.isArray(mkrs) ? mkrs : [])
      setMessages(Array.isArray(msgs) ? msgs : [])
    })
  }, [])

  const upcoming = appointments.filter(a => a.status === 'upcoming').sort((a, b) => a.appointment_date.localeCompare(b.appointment_date))
  const nextAppt = upcoming[0]
  const flagged = markers.filter(m => m.status === 'high' || m.status === 'low')
  const activeMeds = medicines.filter(m => m.status === 'active')
  const unread = messages.slice(0, 3)

  const topAlert = flagged[0]

  return (
    <div style={{ padding: '20px 22px' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>Good morning, Mohammed</h2>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>Here's your health overview</p>
      </div>

      {topAlert && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>{topAlert.name} is {topAlert.status}</div>
            <div style={{ fontSize: 11, color: '#a16207', marginTop: 2 }}>Latest: {topAlert.latest_value} {topAlert.unit}</div>
          </div>
          <button onClick={() => router.push(`/dashboard/health/blood/${encodeURIComponent(topAlert.name)}`)} style={{ fontSize: 11, fontWeight: 600, color: '#92400e', background: 'none', border: '1px solid #fde68a', borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}>
            View marker →
          </button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { icon: '📅', val: upcoming.length, label: 'Upcoming appointments', href: '/dashboard/health/appointments' },
          { icon: '💬', val: unread.length, label: 'Health messages', href: '/dashboard/health/messages' },
          { icon: '🩸', val: flagged.length, label: 'Markers flagged', href: '/dashboard/health/blood', hi: flagged.length > 0 },
          { icon: '💊', val: activeMeds.length, label: 'Active medicines', href: '/dashboard/health/medicines' },
        ].map(s => (
          <div key={s.label} onClick={() => router.push(s.href)} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }}>
            <div style={{ fontSize: 18, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.hi ? '#f59e0b' : '#111' }}>{s.val}</div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Next appointment */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Next appointment</span>
            <button onClick={() => router.push('/dashboard/health/appointments')} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>All →</button>
          </div>
          <div style={{ padding: '12px 14px' }}>
            {nextAppt ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: '#f3f4f6', borderRadius: 10, padding: '8px 12px', textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{new Date(nextAppt.appointment_date).getDate()}</div>
                  <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{new Date(nextAppt.appointment_date).toLocaleString('default', { month: 'short' }).toUpperCase()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{nextAppt.appointment_type}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{nextAppt.doctor_name} · {nextAppt.clinic_name}</div>
                </div>
              </div>
            ) : <p style={{ fontSize: 11, color: '#9ca3af' }}>No upcoming appointments</p>}
          </div>
        </div>

        {/* Flagged markers */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Flagged markers</span>
            <button onClick={() => router.push('/dashboard/health/blood')} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>Full panel →</button>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {flagged.length === 0 && <p style={{ fontSize: 11, color: '#9ca3af' }}>All markers in range</p>}
            {flagged.slice(0, 3).map(m => (
              <div key={m.id} onClick={() => router.push(`/dashboard/health/blood/${encodeURIComponent(m.name)}`)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingBottom: 6, borderBottom: '1px solid #f9fafb' }}>
                <div style={{ width: 3, height: 24, borderRadius: 2, background: m.status === 'high' ? '#f59e0b' : '#ef4444', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{m.name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: m.status === 'high' ? '#f59e0b' : '#ef4444' }}>{m.latest_value} {m.unit}</span>
                <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 8, background: m.status === 'high' ? '#fef3c7' : '#fee2e2', color: m.status === 'high' ? '#92400e' : '#991b1b' }}>
                  {m.status === 'high' ? 'High' : 'Low'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent health messages */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Recent health messages</span>
            <button onClick={() => router.push('/dashboard/health/messages')} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>All →</button>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {unread.length === 0 && <p style={{ fontSize: 11, color: '#9ca3af' }}>No health messages found</p>}
            {unread.map((msg, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#dbeafe', color: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {(msg.from ?? '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>{msg.from}</div>
                  <div style={{ fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg.subject}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Medicines */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Current medicines</span>
            <button onClick={() => router.push('/dashboard/health/medicines')} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>All →</button>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeMeds.length === 0 && <p style={{ fontSize: 11, color: '#9ca3af' }}>No medicines on record</p>}
            {activeMeds.slice(0, 3).map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>💊</span>
                <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{m.name}</span>
                <span style={{ fontSize: 10, color: '#6b7280' }}>{m.dose}{m.dose_unit} · {m.frequency}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
