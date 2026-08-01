import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type {
  ExtractedAppointment,
  ExtractedBloodResult,
  ExtractedMedicine,
  PendingRecord,
} from '@/lib/health/types'

/**
 * Applies records the user confirmed from an ingest's pending list. The client
 * may have edited values first, so everything is re-validated here.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { records, document_id } = (await req.json()) as {
    records: PendingRecord[]
    document_id?: string | null
  }
  if (!Array.isArray(records)) {
    return NextResponse.json({ error: 'records must be an array.' }, { status: 400 })
  }

  const applied = { blood_results: 0, medicines: 0, appointments: 0 }
  const errors: string[] = []

  for (const item of records) {
    if (item.kind === 'blood_result') {
      const r = item.record as ExtractedBloodResult
      if (!r.marker_id) {
        errors.push(`${r.marker_name}: no catalogue marker selected`)
        continue
      }
      if (typeof r.value !== 'number' || Number.isNaN(r.value)) {
        errors.push(`${r.marker_name}: value must be a number`)
        continue
      }
      if (!r.test_date) {
        errors.push(`${r.marker_name}: a test date is required`)
        continue
      }
      const { error } = await supabase.from('health_blood_results').insert({
        user_id: user.id,
        marker_id: r.marker_id,
        value: r.value,
        test_date: r.test_date,
        lab_name: r.lab_name || null,
        document_id: document_id || null,
      })
      error ? errors.push(`${r.marker_name}: ${error.message}`) : applied.blood_results++
    }

    if (item.kind === 'medicine') {
      const m = item.record as ExtractedMedicine
      if (!m.name?.trim()) {
        errors.push('A medicine name is required')
        continue
      }
      const { error } = await supabase.from('health_medicines').insert({
        user_id: user.id,
        name: m.name.trim(),
        dose: typeof m.dose === 'number' ? m.dose : null,
        dose_unit: m.dose_unit || null,
        frequency: m.frequency || null,
        route: m.route || null,
        start_date: m.start_date || null,
        prescribing_doctor: m.prescribing_doctor || null,
      })
      error ? errors.push(`${m.name}: ${error.message}`) : applied.medicines++
    }

    if (item.kind === 'appointment') {
      const a = item.record as ExtractedAppointment
      if (!a.appointment_type?.trim()) {
        errors.push('An appointment type is required')
        continue
      }
      if (!a.appointment_date) {
        errors.push(`${a.appointment_type}: a date is required`)
        continue
      }
      const { error } = await supabase.from('health_appointments').insert({
        user_id: user.id,
        appointment_date: a.appointment_date,
        appointment_type: a.appointment_type.trim(),
        doctor_name: a.doctor_name || null,
        clinic_name: a.clinic_name || null,
        status: new Date(a.appointment_date) > new Date() ? 'upcoming' : 'completed',
      })
      error ? errors.push(`${a.appointment_type}: ${error.message}`) : applied.appointments++
    }
  }

  return NextResponse.json({ applied, errors })
}
