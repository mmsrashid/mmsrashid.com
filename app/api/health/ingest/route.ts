import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { extractHealthRecords, isSupportedMime } from '@/lib/health/extract'
import { buildMarkerResolver } from '@/lib/health/match-marker'
import type {
  BloodMarker,
  ExtractedAppointment,
  ExtractedBloodResult,
  ExtractedMedicine,
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
  const applied = { blood_results: 0, medicines: 0, appointments: 0 }

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

    const { error } = await supabase.from('health_blood_results').insert({
      user_id: user.id,
      marker_id: marker.id,
      value: r.value,
      test_date,
      lab_name: r.lab_name || null,
      document_id: doc.id,
    })
    if (error) errors.push(`${marker.name}: ${error.message}`)
    else applied.blood_results++
  }

  /* ---- Medicines ---- */
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
    const { error } = await supabase.from('health_medicines').insert({
      user_id: user.id,
      name: m.name.trim(),
      dose: typeof m.dose === 'number' ? m.dose : null,
      dose_unit: m.dose_unit || null,
      frequency: m.frequency || null,
      route: m.route || null,
      start_date: toDateOnly(m.start_date),
      prescribing_doctor: m.prescribing_doctor || null,
    })
    if (error) errors.push(`${m.name}: ${error.message}`)
    else applied.medicines++
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

  const body: IngestResponse = {
    document: doc,
    summary: extraction.summary,
    applied,
    pending,
    errors,
  }
  return NextResponse.json(body)
}
