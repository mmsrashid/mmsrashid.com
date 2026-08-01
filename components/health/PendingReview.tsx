'use client'
import { useState } from 'react'
import type {
  ExtractedAppointment,
  ExtractedBloodResult,
  ExtractedExercise,
  ExtractedMedicine,
  ExtractedNutrition,
  ExtractedPillLog,
  ExtractedSleep,
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
  sleep: '😴 Sleep',
  nutrition: '🥗 Nutrition',
  exercise: '🏃 Exercise',
  pill_log: '✅ Pill log',
}

const input: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  color: '#111',
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

  /** Rows the server is guaranteed to reject, so they can't be selected. */
  const blocked = (row: PendingRecord) => {
    if (row.kind === 'blood_result') return !(row.record as ExtractedBloodResult).marker_id
    if (row.kind === 'pill_log') return !(row.record as ExtractedPillLog).medicine_id
    return false
  }

  const selectedCount = chosen.filter((c, i) => c && !blocked(rows[i]!)).length
  const blockedCount = rows.filter(blocked).length

  async function apply() {
    setSaving(true)
    try {
      // Never send rows the server is guaranteed to reject.
      await onApply(rows.filter((row, i) => chosen[i] && !blocked(row)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, color: '#92400e', fontWeight: 700 }}>
        Needs your check — I wasn&apos;t confident about these
      </div>
      {blockedCount > 0 && (
        <div style={{ fontSize: 9, color: '#6b7280', lineHeight: 1.5 }}>
          {`${blockedCount} ${blockedCount === 1 ? 'row is' : 'rows are'} greyed out — there's no matching entry to file them against. Tell me the name and I'll add it.`}
        </div>
      )}

      {/* A pill grid can produce dozens of rows, so ticking each one isn't reasonable. */}
      {rows.length > 3 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setChosen(rows.map(r => !blocked(r)))}
            style={{ fontSize: 9, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}
          >Select all {rows.length - blockedCount}</button>
          <button
            onClick={() => setChosen(rows.map(() => false))}
            style={{ fontSize: 9, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}
          >Clear</button>
        </div>
      )}

      {rows.map((row, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, cursor: blocked(row) ? 'not-allowed' : 'pointer', opacity: blocked(row) ? 0.65 : 1 }}>
            <input
              type="checkbox"
              disabled={blocked(row)}
              checked={chosen[i] && !blocked(row)}
              onChange={e => setChosen(c => c.map((v, j) => (j === i ? e.target.checked : v)))}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <span style={{ fontSize: 10, color: '#111', fontWeight: 600 }}>
              {KIND_LABEL[row.kind]}
              <span style={{ display: 'block', color: '#6b7280', fontWeight: 400, marginTop: 1 }}>{row.reason}</span>
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

          {row.kind === 'pill_log' && (() => {
            const p = row.record as ExtractedPillLog
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={label}>medicine {p.matched_name ? `→ ${p.matched_name}` : '(no active medicine — cannot save)'}</span>
                  <input style={input} value={p.medicine_name ?? ''} onChange={e => patch(i, { medicine_name: e.target.value })} />
                </div>
                <div>
                  <span style={label}>date</span>
                  <input style={input} type="date" value={p.log_date ?? ''} onChange={e => patch(i, { log_date: e.target.value || null })} />
                </div>
                <div>
                  <span style={label}>taken</span>
                  <select style={input} value={p.taken ? 'yes' : 'no'} onChange={e => patch(i, { taken: e.target.value === 'yes' })}>
                    <option value="yes">taken</option>
                    <option value="no">not taken</option>
                  </select>
                </div>
              </div>
            )
          })()}

          {row.kind === 'sleep' && (() => {
            const s = row.record as ExtractedSleep
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                <div>
                  <span style={label}>date</span>
                  <input style={input} type="date" value={s.sleep_date ?? ''} onChange={e => patch(i, { sleep_date: e.target.value || null })} />
                </div>
                <div>
                  <span style={label}>hours</span>
                  <input style={input} type="number" step="0.1" value={s.total_hours ?? ''} onChange={e => patch(i, { total_hours: e.target.value === '' ? null : parseFloat(e.target.value) })} />
                </div>
                <div>
                  <span style={label}>quality (0–100)</span>
                  <input style={input} type="number" value={s.quality_score ?? ''} onChange={e => patch(i, { quality_score: e.target.value === '' ? null : parseInt(e.target.value, 10) })} />
                </div>
              </div>
            )
          })()}

          {row.kind === 'nutrition' && (() => {
            const n = row.record as ExtractedNutrition
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                <div>
                  <span style={label}>date</span>
                  <input style={input} type="date" value={n.log_date ?? ''} onChange={e => patch(i, { log_date: e.target.value || null })} />
                </div>
                <div>
                  <span style={label}>calories</span>
                  <input style={input} type="number" value={n.calories ?? ''} onChange={e => patch(i, { calories: e.target.value === '' ? null : parseInt(e.target.value, 10) })} />
                </div>
                <div>
                  <span style={label}>protein (g)</span>
                  <input style={input} type="number" step="0.1" value={n.protein_g ?? ''} onChange={e => patch(i, { protein_g: e.target.value === '' ? null : parseFloat(e.target.value) })} />
                </div>
                <div>
                  <span style={label}>water (ml)</span>
                  <input style={input} type="number" value={n.water_ml ?? ''} onChange={e => patch(i, { water_ml: e.target.value === '' ? null : parseInt(e.target.value, 10) })} />
                </div>
              </div>
            )
          })()}

          {row.kind === 'exercise' && (() => {
            const x = row.record as ExtractedExercise
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={label}>activity</span>
                  <input style={input} value={x.activity_type ?? ''} onChange={e => patch(i, { activity_type: e.target.value })} />
                </div>
                <div>
                  <span style={label}>date</span>
                  <input style={input} type="date" value={x.exercise_date ?? ''} onChange={e => patch(i, { exercise_date: e.target.value || null })} />
                </div>
                <div>
                  <span style={label}>duration (min)</span>
                  <input style={input} type="number" value={x.duration_min ?? ''} onChange={e => patch(i, { duration_min: e.target.value === '' ? null : parseInt(e.target.value, 10) })} />
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
            flex: 1, background: selectedCount ? '#1d4ed8' : '#e5e7eb',
            color: selectedCount ? '#fff' : '#9ca3af', border: 'none',
            borderRadius: 7, padding: '6px 10px', fontSize: 10, fontWeight: 600,
            cursor: selectedCount && !saving ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving…' : selectedCount ? `Save ${selectedCount}` : 'Select items'}
        </button>
        <button
          onClick={onDismiss}
          disabled={saving}
          style={{ background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 7, padding: '6px 10px', fontSize: 10, cursor: 'pointer' }}
        >
          Discard
        </button>
      </div>
    </div>
  )
}
