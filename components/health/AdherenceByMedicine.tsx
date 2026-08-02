'use client'
import { adherenceMode, isDaily, wasActiveOn, MODE_LABEL } from '@/lib/health/adherence'

interface Medicine {
  id: string; name: string; frequency: string | null; route: string | null
  start_date: string | null; end_date: string | null
}
interface PillLog { medicine_id: string; log_date: string; taken: boolean }

const pctColour = (p: number) => (p >= 80 ? '#059669' : p >= 50 ? '#d97706' : '#dc2626')

/**
 * Adherence per medicine over the whole recorded history.
 *
 * Counts a medicine only on days it was actually prescribed — a dose that ran
 * for five weeks before a change shouldn't be scored against a year, and a
 * stray tick outside its window shouldn't inflate the denominator either.
 */
export default function AdherenceByMedicine({
  medicines,
  logs,
}: {
  medicines: Medicine[]
  logs: PillLog[]
}) {
  const byMed = new Map<string, { taken: number; total: number }>()
  for (const l of logs) {
    const m = medicines.find(x => x.id === l.medicine_id)
    if (!m || !isDaily(m) || !wasActiveOn(m, l.log_date)) continue
    const e = byMed.get(m.id) ?? { taken: 0, total: 0 }
    e.total++
    if (l.taken) e.taken++
    byMed.set(m.id, e)
  }

  const rows = [...byMed.entries()]
    .map(([id, v]) => {
      const m = medicines.find(x => x.id === id)!
      return { name: m.name, pct: Math.round((v.taken / v.total) * 100), ...v }
    })
    .sort((a, b) => b.pct - a.pct)

  const excluded = medicines.filter(m => !isDaily(m))

  if (rows.length === 0) {
    return <p style={{ fontSize: 12, color: '#9ca3af' }}>No adherence history yet.</p>
  }

  const cell: React.CSSProperties = { padding: '9px 14px', borderBottom: '1px solid #f9fafb' }

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {['Medicine', 'Adherence', 'Taken', ''].map(h => (
              <th key={h} style={{
                textAlign: h === 'Medicine' || h === '' ? 'left' : 'right',
                padding: '8px 14px', background: '#fafafa', color: '#9ca3af',
                fontWeight: 600, fontSize: 11, borderBottom: '1px solid #f3f4f6',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name}>
              <td style={{ ...cell, fontWeight: 600 }}>{r.name}</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 700, color: pctColour(r.pct) }}>{r.pct}%</td>
              <td style={{ ...cell, textAlign: 'right', color: '#6b7280' }}>{r.taken}/{r.total}</td>
              <td style={{ ...cell, width: '35%' }}>
                <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${r.pct}%`, background: pctColour(r.pct), borderRadius: 3 }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {excluded.length > 0 && (
        <p style={{ fontSize: 9, color: '#9ca3af', marginTop: 8, lineHeight: 1.6 }}>
          Not scored because they aren&apos;t daily doses:{' '}
          {excluded.map(m => `${m.name} (${MODE_LABEL[adherenceMode(m)].toLowerCase()})`).join(', ')}.
        </p>
      )}
    </div>
  )
}
