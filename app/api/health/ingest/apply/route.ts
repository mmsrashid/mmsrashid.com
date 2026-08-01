import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type {
  AppliedCounts,
  ExtractedAppointment,
  ExtractedBloodResult,
  ExtractedExercise,
  ExtractedMedicine,
  ExtractedNutrition,
  ExtractedPillLog,
  ExtractedSleep,
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

  const applied: AppliedCounts = {
    blood_results: 0, medicines: 0, appointments: 0,
    sleep: 0, nutrition: 0, exercise: 0, pill_logs: 0,
  }
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

    if (item.kind === 'sleep') {
      const s = item.record as ExtractedSleep
      if (!s.sleep_date) {
        errors.push('Sleep: a date is required')
        continue
      }
      const { error } = await supabase.from('health_sleep_logs').upsert({
        user_id: user.id,
        sleep_date: s.sleep_date,
        total_hours: s.total_hours,
        quality_score: s.quality_score == null ? null : Math.round(s.quality_score),
        bedtime: s.bedtime || null,
        wake_time: s.wake_time || null,
      }, { onConflict: 'user_id,sleep_date' })
      error ? errors.push(`Sleep ${s.sleep_date}: ${error.message}`) : applied.sleep++
    }

    if (item.kind === 'nutrition') {
      const n = item.record as ExtractedNutrition
      if (!n.log_date) {
        errors.push('Nutrition: a date is required')
        continue
      }
      const { error } = await supabase.from('health_nutrition_logs').upsert({
        user_id: user.id,
        log_date: n.log_date,
        calories: n.calories == null ? null : Math.round(n.calories),
        protein_g: n.protein_g,
        carbs_g: n.carbs_g,
        fat_g: n.fat_g,
        water_ml: n.water_ml == null ? null : Math.round(n.water_ml),
      }, { onConflict: 'user_id,log_date' })
      error ? errors.push(`Nutrition ${n.log_date}: ${error.message}`) : applied.nutrition++
    }

    if (item.kind === 'exercise') {
      const e = item.record as ExtractedExercise
      if (!e.activity_type?.trim()) {
        errors.push('Exercise: an activity type is required')
        continue
      }
      if (!e.exercise_date) {
        errors.push(`${e.activity_type}: a date is required`)
        continue
      }
      const { error } = await supabase.from('health_exercise_logs').insert({
        user_id: user.id,
        exercise_date: e.exercise_date,
        activity_type: e.activity_type.trim(),
        duration_min: e.duration_min == null ? null : Math.round(e.duration_min),
        intensity: e.intensity ?? null,
        distance_km: e.distance_km,
        avg_heart_rate: e.avg_heart_rate == null ? null : Math.round(e.avg_heart_rate),
      })
      error ? errors.push(`${e.activity_type}: ${error.message}`) : applied.exercise++
    }

    if (item.kind === 'pill_log') {
      const p = item.record as ExtractedPillLog
      if (!p.medicine_id) {
        errors.push(`${p.medicine_name}: no matching active medicine`)
        continue
      }
      if (!p.log_date) {
        errors.push(`${p.medicine_name}: a date is required`)
        continue
      }
      const { error } = await supabase.from('health_pill_logs').upsert({
        user_id: user.id,
        medicine_id: p.medicine_id,
        log_date: p.log_date,
        taken: !!p.taken,
      }, { onConflict: 'user_id,medicine_id,log_date' })
      error ? errors.push(`${p.medicine_name} ${p.log_date}: ${error.message}`) : applied.pill_logs++
    }
  }

  return NextResponse.json({ applied, errors })
}
