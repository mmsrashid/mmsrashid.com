'use client'
import { useState } from 'react'
import type {
  ExtractedAppointment,
  ExtractedBloodResult,
  ExtractedMedicine,
  PendingRecord,
} from '@/lib/health/types'

interface Props {
  items: PendingRecord[]
  onApply: (chosen: PendingRecord[]) => void | Promise<void>
  onDismiss: () => void
}

const KIND_LABEL: Record<PendingRecord['kind'], string> = {
  blood_result: '🩸 Test result',
  medicine: '💊 Medicine',
  appointment: '📅 Appointment',
}

const input: React.CSSProperties = {
  background: '#111827',
  border: '1px solid #374151',
  borderRadius: 6,
  color: '#fff',
  fontSize: 10,
  padding: '4px 6px',
  width: '100%',
  outline: 'none',
}

const label: React.CSSProperties = { fontSize: 9, color: '#6b7280', display: 'block', marginBottom: 2 }

/**
 * Review card for records the ingest held back — either low confidence or a
 * missing required field. Values are editable before saving, since the whole
 * point is that the model wasn't sure it read them correctly.
 */
export default function PendingReview({ items, onApply, onDismiss }: Props) {
  const [rows, setRows] = useState<PendingRecord[]>(items)
  const [chosen, setChosen] = useState<boolean[]>(items.map(() => false))
  const [saving, setSaving] = useState(false)

  const patch = (i: number, changes: Record<string, unknown>) =>
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, record: { ...r.record, ...changes } } : r)))

  const selectedCount = chosen.filter(Boolean).length

  async function apply() {
    setSaving(true)
    try {
      await onApply(rows.filter((_, i) => chosen[i]))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 10, padding: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, color: '#fbbf24', fontWeight: 600 }}>
        Needs your check — I wasn&apos;t confident about these
      </div>

      {rows.map((row, i) => (
        <div key={i} style={{ background: '#111827', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={chosen[i]}
              onChange={e => setChosen(c => c.map((v, j) => (j === i ? e.target.checked : v)))}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <span style={{ fontSize: 10, color: '#e5e7eb', fontWeight: 600 }}>
              {KIND_LABEL[row.kind]}
              <span style={{ display: 'block', color: '#9ca3af', fontWeight: 400, marginTop: 1 }}>{row.reason}</span>
            </span>
          </label>

          {row.kind === 'blood_result' && (() => {
            const r = row.record as ExtractedBloodResult
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={label}>marker {r.matched_name ? `→ ${r.matched_name}` : '(no catalogue match — cannot save)'}</span>
                  <input style={input} value={r.marker_name} onChange={e => patch(i, { marker_name: e.target.value })} />
                </div>
                <div>
                  <span style={label}>value</span>
                  <input style={input} type="number" step="any" value={r.value ?? ''} onChange={e => patch(i, { value: e.target.value === '' ? null : parseFloat(e.target.value) })} />
                </div>
                <div>
                  <span style={label}>test date</span>
                  <input style={input} type="date" value={r.test_date ?? ''} onChange={e => patch(i, { test_date: e.target.value || null })} />
                </div>
              </div>
            )
          })()}

          {row.kind === 'medicine' && (() => {
            const m = row.record as ExtractedMedicine
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={label}>name</span>
                  <input style={input} value={m.name ?? ''} onChange={e => patch(i, { name: e.target.value })} />
                </div>
                <div>
                  <span style={label}>dose</span>
                  <input style={input} type="number" step="any" value={m.dose ?? ''} onChange={e => patch(i, { dose: e.target.value === '' ? null : parseFloat(e.target.value) })} />
                </div>
                <div>
                  <span style={label}>unit</span>
                  <input style={input} value={m.dose_unit ?? ''} onChange={e => patch(i, { dose_unit: e.target.value })} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={label}>frequency</span>
                  <input style={input} value={m.frequency ?? ''} onChange={e => patch(i, { frequency: e.target.value })} />
                </div>
              </div>
            )
          })()}

          {row.kind === 'appointment' && (() => {
            const a = row.record as ExtractedAppointment
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={label}>type</span>
                  <input style={input} value={a.appointment_type ?? ''} onChange={e => patch(i, { appointment_type: e.target.value })} />
                </div>
                <div>
                  <span style={label}>date</span>
                  <input
                    style={input}
                    type="date"
                    value={a.appointment_date ? a.appointment_date.slice(0, 10) : ''}
                    onChange={e => patch(i, { appointment_date: e.target.value || null })}
                  />
                </div>
                <div>
                  <span style={label}>doctor</span>
                  <input style={input} value={a.doctor_name ?? ''} onChange={e => patch(i, { doctor_name: e.target.value })} />
                </div>
              </div>
            )
          })()}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={apply}
          disabled={saving || selectedCount === 0}
          style={{
            flex: 1, background: selectedCount ? '#1d4ed8' : '#374151', color: '#fff', border: 'none',
            borderRadius: 7, padding: '6px 10px', fontSize: 10, fontWeight: 600,
            cursor: selectedCount && !saving ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving…' : selectedCount ? `Save ${selectedCount}` : 'Select items'}
        </button>
        <button
          onClick={onDismiss}
          disabled={saving}
          style={{ background: '#374151', color: '#d1d5db', border: 'none', borderRadius: 7, padding: '6px 10px', fontSize: 10, cursor: 'pointer' }}
        >
          Discard
        </button>
      </div>
    </div>
  )
}
