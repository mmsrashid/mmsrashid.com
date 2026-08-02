import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { parsePillCsv } from '@/lib/health/parse-pill-csv'
import { buildMedicineResolver } from '@/lib/health/match-medicine'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 5 * 1024 * 1024

export interface PillImportResponse {
  imported: number
  daysCovered: number
  dateRange: { from: string; to: string } | null
  matchedMedicines: string[]
  /** Column headers with no matching active medicine — reported, not guessed at. */
  unmatchedColumns: string[]
  skippedRows: number
  unrecognisedValues: string[]
  errors: string[]
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No CSV file supplied.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'CSV is larger than 5MB.' }, { status: 413 })
  }

  const parsed = parsePillCsv(await file.text())
  if (parsed.medicineNames.length === 0) {
    return NextResponse.json(
      { error: 'No medicine columns found. Expected a date column plus one column per medicine.' },
      { status: 422 },
    )
  }

  const { data: medicines, error: mErr } = await supabase
    .from('health_medicines')
    .select('id, name')
    .eq('status', 'active')
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  const resolve = buildMedicineResolver(medicines ?? [])

  const columnMap = new Map<string, { id: string; name: string }>()
  const unmatchedColumns: string[] = []
  for (const header of parsed.medicineNames) {
    const hit = resolve(header)
    if (hit) columnMap.set(header, hit)
    else unmatchedColumns.push(header)
  }

  const rows = parsed.cells
    .filter(c => columnMap.has(c.medicineName))
    .map(c => ({
      user_id: user.id,
      medicine_id: columnMap.get(c.medicineName)!.id,
      log_date: c.date,
      taken: c.taken,
    }))

  const errors: string[] = []
  let imported = 0

  // Chunked so a long history doesn't hit statement or payload limits.
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('health_pill_logs')
      .upsert(slice, { onConflict: 'user_id,medicine_id,log_date' })
    if (error) errors.push(`Rows ${i + 1}-${i + slice.length}: ${error.message}`)
    else imported += slice.length
  }

  const dates = [...new Set(rows.map(r => r.log_date))].sort()
  const body: PillImportResponse = {
    imported,
    daysCovered: dates.length,
    dateRange: dates.length ? { from: dates[0]!, to: dates[dates.length - 1]! } : null,
    matchedMedicines: [...new Set([...columnMap.values()].map(m => m.name))],
    unmatchedColumns,
    skippedRows: parsed.skippedRows,
    unrecognisedValues: parsed.unrecognisedValues,
    errors,
  }
  return NextResponse.json(body)
}
