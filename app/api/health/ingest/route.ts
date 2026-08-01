import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { extractHealthRecords, isSupportedMime } from '@/lib/health/extract'
import { buildMarkerResolver } from '@/lib/health/match-marker'
import type {
  AppliedCounts,
  BloodMarker,
  ExtractedAppointment,
  ExtractedBloodResult,
  ExtractedMedicine,
  ExtractedPillLog,
  IngestResponse,
  PendingRecord,
} from '@/lib/health/types'

export const maxDuration = 60
export const runtime = 'nodejs'

const MAX_BYTES = 20 * 1024 * 1024

/** Accepts YYYY-MM-DD or a full ISO timestamp; returns YYYY-MM-DD or null. */
function toDateOnly(v: string | null): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function toTimestamp(v: string | null): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file supplied.' }, { status: 400 })
  }
  if (!isSupportedMime(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type "${file.type || 'unknown'}". Use a PDF, PNG, JPEG, WebP or GIF.` },
      { status: 415 },
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is larger than 20MB.' }, { status: 413 })
  }

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const name = file.name || `upload-${Date.now()}`

  // Extract before writing anything, so a model failure doesn't leave a
  // document row with nothing attached to it.
  let extraction
  try {
    extraction = await extractHealthRecords(base64, file.type)
  } catch (err) {
    return NextResponse.json({ error: `Could not read the document: ${String(err)}` }, { status: 502 })
  }

  const storagePath = `${user.id}/${Date.now()}-${name}`
  const { error: uploadErr } = await supabase.storage
    .from('health-documents')
    .upload(storagePath, bytes, { contentType: file.type })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const errors: string[] = []
  const pending: PendingRecord[] = []
  const applied: AppliedCounts = {
    blood_results: 0, medicines: 0, appointments: 0,
    sleep: 0, nutrition: 0, exercise: 0, pill_logs: 0,
  }

  const { data: markerRows } = await supabase
    .from('health_blood_markers')
    .select('*')
  const resolver = buildMarkerResolver((markerRows ?? []) as BloodMarker[])

  /* ---- Document record ---- */
  const { data: doc, error: docErr } = await supabase
    .from('health_documents')
    .insert({
      user_id: user.id,
      name,
      type: extraction.document_type,
      storage_path: storagePath,
      file_size_bytes: file.size,
      extracted_marker_count: extraction.blood_results.length,
      tags: extraction.tags,
    })
    .select()
    .single()

  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 })

  /* ---- Blood results ---- */
  for (const r of extraction.blood_results) {
    const marker = resolver.resolve(r.marker_name)
    const enriched: ExtractedBloodResult = {
      ...r,
      marker_id: marker?.id ?? null,
      matched_name: marker?.name ?? null,
    }
    const test_date = toDateOnly(r.test_date)

    if (!marker) {
      pending.push({ kind: 'blood_result', reason: `"${r.marker_name}" is not in the marker catalogue`, record: enriched })
      continue
    }
    if (typeof r.value !== 'number' || Number.isNaN(r.value)) {
      pending.push({ kind: 'blood_result', reason: 'No usable numeric value', record: enriched })
      continue
    }
    if (!test_date) {
      pending.push({ kind: 'blood_result', reason: 'No test date on the document', record: enriched })
      continue
    }
    if (r.confidence !== 'high') {
      pending.push({ kind: 'blood_result', reason: 'Value was unclear in the source', record: enriched })
      continue
    }

    // One reading per marker per date, so re-uploading a panel updates rather
    // than duplicating.
    const { error } = await supabase.from('health_blood_results').upsert({
      user_id: user.id,
      marker_id: marker.id,
      value: r.value,
      test_date,
      lab_name: r.lab_name || null,
      document_id: doc.id,
    }, { onConflict: 'user_id,marker_id,test_date' })
    if (error) errors.push(`${marker.name}: ${error.message}`)
    else applied.blood_results++
  }

  /* ---- Medicines ---- */
  // Fetch once so repeated names within a document collapse too.
  const { data: existingMeds } = await supabase
    .from('health_medicines')
    .select('id, name, dose, dose_unit, frequency, route, start_date, prescribing_doctor')
    .eq('status', 'active')
  const medIndex = new Map<string, NonNullable<typeof existingMeds>[number]>()
  for (const m of existingMeds ?? []) medIndex.set(m.name.trim().toLowerCase(), m)

  for (const m of extraction.medicines) {
    const rec: ExtractedMedicine = m
    if (!m.name?.trim()) {
      pending.push({ kind: 'medicine', reason: 'No medicine name', record: rec })
      continue
    }
    if (m.confidence !== 'high') {
      pending.push({ kind: 'medicine', reason: 'Details were unclear in the source', record: rec })
      continue
    }

    const name = m.name.trim()
    const incoming = {
      dose: typeof m.dose === 'number' ? m.dose : null,
      dose_unit: m.dose_unit || null,
      frequency: m.frequency || null,
      route: m.route || null,
      start_date: toDateOnly(m.start_date),
      prescribing_doctor: m.prescribing_doctor || null,
    }
    const existing = medIndex.get(name.toLowerCase())

    if (existing) {
      // Only fill gaps — never overwrite a value already on record with null.
      const patch: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(incoming)) {
        if (v !== null && existing[k as keyof typeof existing] == null) patch[k] = v
      }
      if (Object.keys(patch).length === 0) continue
      const { error } = await supabase.from('health_medicines').update(patch).eq('id', existing.id)
      if (error) errors.push(`${name}: ${error.message}`)
      continue
    }

    const { data: inserted, error } = await supabase
      .from('health_medicines')
      .insert({ user_id: user.id, name, ...incoming })
      .select('id, name, dose, dose_unit, frequency, route, start_date, prescribing_doctor')
      .single()
    if (error) { errors.push(`${name}: ${error.message}`); continue }
    medIndex.set(name.toLowerCase(), inserted)
    applied.medicines++
  }

  /* ---- Appointments ---- */
  for (const a of extraction.appointments) {
    const rec: ExtractedAppointment = a
    const when = toTimestamp(a.appointment_date)
    if (!a.appointment_type?.trim()) {
      pending.push({ kind: 'appointment', reason: 'No appointment type', record: rec })
      continue
    }
    if (!when) {
      pending.push({ kind: 'appointment', reason: 'No date on the document', record: rec })
      continue
    }
    if (a.confidence !== 'high') {
      pending.push({ kind: 'appointment', reason: 'Details were unclear in the source', record: rec })
      continue
    }
    const { error } = await supabase.from('health_appointments').insert({
      user_id: user.id,
      appointment_date: when,
      appointment_type: a.appointment_type.trim(),
      doctor_name: a.doctor_name || null,
      clinic_name: a.clinic_name || null,
      status: new Date(when) > new Date() ? 'upcoming' : 'completed',
    })
    if (error) errors.push(`${a.appointment_type}: ${error.message}`)
    else applied.appointments++
  }

  /* ---- Sleep ---- */
  for (const s of extraction.sleep) {
    const date = toDateOnly(s.sleep_date)
    if (!date) {
      pending.push({ kind: 'sleep', reason: 'No date on the record', record: s })
      continue
    }
    if (s.confidence !== 'high') {
      pending.push({ kind: 'sleep', reason: 'Figures were unclear in the source', record: s })
      continue
    }
    const { error } = await supabase.from('health_sleep_logs').upsert({
      user_id: user.id,
      sleep_date: date,
      total_hours: s.total_hours,
      quality_score: s.quality_score == null ? null : Math.round(s.quality_score),
      bedtime: s.bedtime || null,
      wake_time: s.wake_time || null,
    }, { onConflict: 'user_id,sleep_date' })
    if (error) errors.push(`Sleep ${date}: ${error.message}`)
    else applied.sleep++
  }

  /* ---- Nutrition ---- */
  for (const n of extraction.nutrition) {
    const date = toDateOnly(n.log_date)
    if (!date) {
      pending.push({ kind: 'nutrition', reason: 'No date on the record', record: n })
      continue
    }
    if (n.confidence !== 'high') {
      pending.push({ kind: 'nutrition', reason: 'Figures were unclear in the source', record: n })
      continue
    }
    const { error } = await supabase.from('health_nutrition_logs').upsert({
      user_id: user.id,
      log_date: date,
      calories: n.calories == null ? null : Math.round(n.calories),
      protein_g: n.protein_g,
      carbs_g: n.carbs_g,
      fat_g: n.fat_g,
      water_ml: n.water_ml == null ? null : Math.round(n.water_ml),
    }, { onConflict: 'user_id,log_date' })
    if (error) errors.push(`Nutrition ${date}: ${error.message}`)
    else applied.nutrition++
  }

  /* ---- Exercise ---- */
  for (const e of extraction.exercise) {
    const date = toDateOnly(e.exercise_date)
    if (!e.activity_type?.trim()) {
      pending.push({ kind: 'exercise', reason: 'No activity type', record: e })
      continue
    }
    if (!date) {
      pending.push({ kind: 'exercise', reason: 'No date on the record', record: e })
      continue
    }
    if (e.confidence !== 'high') {
      pending.push({ kind: 'exercise', reason: 'Figures were unclear in the source', record: e })
      continue
    }
    const { error } = await supabase.from('health_exercise_logs').insert({
      user_id: user.id,
      exercise_date: date,
      activity_type: e.activity_type.trim(),
      duration_min: e.duration_min == null ? null : Math.round(e.duration_min),
      intensity: e.intensity ?? null,
      distance_km: e.distance_km,
      avg_heart_rate: e.avg_heart_rate == null ? null : Math.round(e.avg_heart_rate),
    })
    if (error) errors.push(`${e.activity_type}: ${error.message}`)
    else applied.exercise++
  }

  /* ---- Pill logs ---- */
  // Never auto-applied. A misread grid puts a tick on the wrong day, and unlike
  // a lab value there is no implausible number to give it away later, so every
  // cell goes through confirmation.
  for (const p of extraction.pill_logs) {
    const date = toDateOnly(p.log_date)
    const match = p.medicine_name ? medIndex.get(p.medicine_name.trim().toLowerCase()) : undefined
    const enriched: ExtractedPillLog = {
      ...p,
      medicine_id: match?.id ?? null,
      matched_name: match?.name ?? null,
    }
    if (!date) {
      pending.push({ kind: 'pill_log', reason: 'No date for this cell', record: enriched })
      continue
    }
    enriched.log_date = date
    if (!match) {
      pending.push({
        kind: 'pill_log',
        reason: `"${p.medicine_name}" is not an active medicine`,
        record: enriched,
      })
      continue
    }
    pending.push({
      kind: 'pill_log',
      reason: 'Check the grid alignment before saving',
      record: enriched,
    })
  }

  const body: IngestResponse = {
    document: doc,
    summary: extraction.summary,
    applied,
    pending,
    errors,
  }
  return NextResponse.json(body)
}
