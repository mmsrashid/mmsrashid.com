'use client'
import { doseStatus, describeDose, doseIntervals } from '@/lib/health/schedule'

/** Only the fields this component actually reads. */
interface Dosed {
  id: string
  name: string
  dose: number | null
  dose_unit: string | null
  frequency: string | null
}

interface Log { medicine_id: string; log_date: string; taken: boolean }

/**
 * Medicines that aren't taken daily: injections on a cycle, and rescue
 * medication taken when needed.
 *
 * These were filtered out of the daily adherence list — correctly, since a
 * 30-day injection would otherwise read as 29 missed doses a month — and then
 * never displayed anywhere. There was no way to record an injection at all.
 *
 * The question for a daily pill is "did I take it today". For these it is "when
 * was the last one, and when is the next" — so that is what this shows.
 */
export default function NonDailyDoses({
  medicines, logs, today, onRecord, saving,
}: {
  medicines: Dosed[]
  logs: Log[]
  /** The user's calendar day, not UTC. */
  today: string
  onRecord: (medicineId: string, date: string) => void
  saving: string | null
}) {
  if (medicines.length === 0) return null

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
    marginBottom: 16, overflow: 'hidden',
  }

  return (
    <div style={card}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700 }}>Not taken daily</h3>
        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
          Injections and as-needed medication. These are deliberately left out of the daily
          adherence score — a 30-day injection would otherwise read as 29 missed doses a month.
        </p>
      </div>

      {medicines.map(m => {
        const taken = logs
          .filter(l => l.medicine_id === m.id && l.taken)
          .map(l => l.log_date)
        const s = doseStatus(m.frequency, taken, today)
        const history = doseIntervals(taken).slice(-6).reverse()
        const alreadyToday = taken.includes(today)

        const colour = s.state === 'overdue' ? '#dc2626'
          : s.state === 'due-today' ? '#b45309'
          : s.state === 'scheduled' ? '#059669' : '#6b7280'

        return (
          <div key={m.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f9fafb' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{m.name}</div>
              {m.dose && (
                <span style={{ fontSize: 11, color: '#6b7280' }}>
                  {m.dose}{m.dose_unit ? ` ${m.dose_unit}` : ''}
                </span>
              )}
              {m.frequency && (
                <span style={{ fontSize: 10, color: '#9ca3af' }}>{m.frequency}</span>
              )}

              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: colour }}>
                  {describeDose(s)}
                </span>
                <button
                  onClick={() => onRecord(m.id, today)}
                  disabled={saving === `${m.id}-${today}`}
                  title={alreadyToday
                    ? 'Recorded today — click to undo'
                    : `Record a dose on ${today}`}
                  style={{
                    border: '1px solid', borderColor: alreadyToday ? '#10b981' : '#d1d5db',
                    background: alreadyToday ? '#ecfdf5' : '#111',
                    color: alreadyToday ? '#065f46' : '#fff',
                    borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 600,
                    cursor: saving === `${m.id}-${today}` ? 'wait' : 'pointer',
                  }}
                >
                  {saving === `${m.id}-${today}` ? 'Saving…'
                    : alreadyToday ? '✓ Taken today' : 'Record today'}
                </button>
              </div>
            </div>

            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
              {s.lastTaken
                ? <>Last taken <strong>{s.lastTaken}</strong>
                  {s.nextDue && <> · next due <strong>{s.nextDue}</strong></>}</>
                : 'Nothing recorded yet — record the first dose and the next one is worked out from it.'}
            </div>

            {history.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {history.map(h => (
                  <span key={h.date} style={{
                    fontSize: 10, color: '#374151', background: '#f9fafb',
                    border: '1px solid #f3f4f6', borderRadius: 6, padding: '2px 7px',
                  }}>
                    {h.date}
                    {/* The gap since the previous dose, so a slipping schedule
                        is visible rather than having to be worked out. */}
                    {h.gapDays !== null && (
                      <span style={{ color: '#9ca3af' }}> · +{h.gapDays}d</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
