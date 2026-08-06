'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import AdherenceTrend from '@/components/health/AdherenceTrend'
import AdherenceByMedicine from '@/components/health/AdherenceByMedicine'
import { isDaily, wasActiveOn } from '@/lib/health/adherence'
import { localToday, toLocalDate } from '@/lib/local-date'

interface Medicine {
  id: string; name: string; dose: number | null; dose_unit: string | null
  frequency: string | null; route: string | null
  start_date: string | null; end_date: string | null
}
interface PillLog { id: string; medicine_id: string; log_date: string; taken: boolean; taken_at: string | null }

function getDates(days: number): string[] {
  const dates: string[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    // Local parts, not toISOString: in BST the UTC date is still yesterday
    // between midnight and 1am, which would file a dose against the wrong day.
    dates.push(toLocalDate(d))
  }
  return dates
}

export default function PillTrackerPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [logs, setLogs] = useState<PillLog[]>([])
  const [days] = useState(30)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string[]>([])
  const csvInput = useRef<HTMLInputElement>(null)

  // days=all so the adherence trend covers the whole history, including imports.
  const load = useCallback(() =>
    fetch('/api/health/pill-tracker?days=all')
      .then(r => r.json())
      .then(d => {
        setMedicines(Array.isArray(d.medicines) ? d.medicines : [])
        setLogs(Array.isArray(d.logs) ? d.logs : [])
        setLoading(false)
      }), [])

  useEffect(() => { load() }, [load])

  async function importCsv(file: File) {
    setImporting(true)
    setImportMsg([])
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/health/pill-tracker/import', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) { setImportMsg([d.error || 'Import failed.']); return }

      const lines: string[] = []
      lines.push(`Imported ${d.imported} entries across ${d.daysCovered} days.`)
      if (d.dateRange) lines.push(`${d.dateRange.from} → ${d.dateRange.to}`)
      if (d.matchedMedicines?.length) lines.push(`Matched: ${d.matchedMedicines.join(', ')}`)
      if (d.unmatchedColumns?.length) lines.push(`No matching medicine for: ${d.unmatchedColumns.join(', ')} — add them in the Medicines tab, then re-import.`)
      if (d.skippedRows) lines.push(`${d.skippedRows} row(s) skipped — unreadable date.`)
      if (d.unrecognisedValues?.length) lines.push(`Ignored values: ${d.unrecognisedValues.join(', ')}`)
      if (d.errors?.length) lines.push(`Errors: ${d.errors.join('; ')}`)
      setImportMsg(lines)
      await load()
    } catch (err) {
      setImportMsg([`Import failed: ${String(err)}`])
    } finally {
      setImporting(false)
    }
  }

  const getLog = useCallback((medicineId: string, date: string) =>
    logs.find(l => l.medicine_id === medicineId && l.log_date === date),
    [logs]
  )

  async function toggle(medicineId: string, date: string) {
    const existing = getLog(medicineId, date)
    const newTaken = !existing?.taken
    const key = `${medicineId}-${date}`
    setSaving(key)

    const res = await fetch('/api/health/pill-tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ medicine_id: medicineId, log_date: date, taken: newTaken }),
    })
    const updated = await res.json()
    setSaving(null)

    setLogs(prev => {
      const filtered = prev.filter(l => !(l.medicine_id === medicineId && l.log_date === date))
      return [...filtered, updated]
    })
  }

  const dates = getDates(days)
  const today = localToday()

  const formatDate = (d: string) => {
    const dt = new Date(d + 'T12:00:00')
    return { day: dt.getDate(), mon: dt.toLocaleString('default', { month: 'short' }), isToday: d === today }
  }

  if (loading) return <div style={{ padding: 40, fontSize: 12, color: '#9ca3af' }}>Loading…</div>

  if (medicines.length === 0) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>💊</div>
      <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>No active medicines</p>
      <p style={{ fontSize: 12, color: '#6b7280' }}>Add medicines in the Medicines tab first.</p>
    </div>
  )

  // Only daily medicines, and only once they'd started, count toward adherence.
  // Otherwise a rescue spray and a 28-day injection read as missed doses.
  const dailyMeds = medicines.filter(isDaily)
  const otherMeds = medicines.filter(m => !isDaily(m))
  const dueOn = (date: string) => dailyMeds.filter(m => wasActiveOn(m, date))

  const todayDue = dueOn(today)
  const todayTotal = todayDue.length
  const todayTaken = todayDue.filter(m => getLog(m.id, today)?.taken).length
  const pct = todayTotal > 0 ? Math.round((todayTaken / todayTotal) * 100) : 0

  // Adherence per day, denominator = daily medicines actually due that day, so
  // imported history isn't penalised for drugs not yet started.
  const historyDays = (() => {
    const dates = [...new Set(logs.map(l => l.log_date))].sort()
    const dailyIds = new Set(dailyMeds.map(m => m.id))
    return dates.map(date => {
      const due = dueOn(date)
      const taken = logs.filter(l => l.log_date === date && l.taken && dailyIds.has(l.medicine_id)).length
      return { date, taken, total: due.length }
    }).filter(d => d.total > 0)
  })()

  return (
    <div style={{ padding: '20px 22px' }}>
      {/* Today summary */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 2 }}>TODAY'S ADHERENCE</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{todayTaken}/{todayTotal} <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 400 }}>taken</span></div>
        </div>
        <div style={{ flex: 1, height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#10b981' : pct > 50 ? '#f59e0b' : '#ef4444', borderRadius: 4, transition: 'width .3s' }} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: pct === 100 ? '#10b981' : pct > 50 ? '#f59e0b' : '#ef4444' }}>{pct}%</div>
      </div>

      {/* Adherence over time */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Adherence over time</h3>
          <button
            onClick={() => csvInput.current?.click()}
            disabled={importing}
            style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, padding: '5px 12px', fontSize: 10, fontWeight: 600, cursor: importing ? 'wait' : 'pointer' }}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <input
            ref={csvInput}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = '' }}
          />
        </div>
        <AdherenceTrend days={historyDays} />
        {importMsg.length > 0 && (
          <div style={{ marginTop: 10, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' }}>
            {importMsg.map((l, i) => (
              <p key={i} style={{ fontSize: 10, color: '#374151', lineHeight: 1.6 }}>{l}</p>
            ))}
          </div>
        )}
      </div>

      {/* Adherence per medicine */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700 }}>Adherence by medicine</h3>
          <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
            Across the whole recorded history, counting each medicine only on days it was prescribed.
          </p>
        </div>
        <AdherenceByMedicine medicines={medicines} logs={logs} />
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, borderBottom: '1px solid #f3f4f6', position: 'sticky', left: 0, background: '#fff', minWidth: 160, zIndex: 1 }}>Medicine</th>
              {dates.map(d => {
                const { day, mon, isToday } = formatDate(d)
                return (
                  <th key={d} style={{ padding: '6px 8px', textAlign: 'center', fontWeight: isToday ? 700 : 400, fontSize: 10, borderBottom: '1px solid #f3f4f6', minWidth: 44, color: isToday ? '#111' : '#9ca3af', background: isToday ? '#f0f9ff' : '#fff' }}>
                    <div>{day}</div>
                    <div style={{ fontSize: 9 }}>{mon}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {dailyMeds.map((med, mi) => (
              <tr key={med.id} style={{ background: mi % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '8px 14px', borderBottom: '1px solid #f9fafb', position: 'sticky', left: 0, background: mi % 2 === 0 ? '#fff' : '#fafafa', zIndex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{med.name}</div>
                  {(med.dose || med.frequency) && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{med.dose}{med.dose_unit} · {med.frequency}</div>}
                </td>
                {dates.map(d => {
                  const log = getLog(med.id, d)
                  const taken = log?.taken ?? false
                  const key = `${med.id}-${d}`
                  const isSaving = saving === key
                  const isToday = d === today
                  return (
                    <td key={d} style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #f9fafb', background: isToday ? '#f0f9ff' : undefined }}>
                      <button
                        onClick={() => toggle(med.id, d)}
                        disabled={isSaving}
                        style={{
                          width: 22, height: 22, borderRadius: 4, border: '1.5px solid',
                          borderColor: taken ? '#3b82f6' : '#d1d5db',
                          background: taken ? '#3b82f6' : '#fff',
                          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all .15s', opacity: isSaving ? 0.5 : 1,
                        }}
                      >
                        {taken && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
