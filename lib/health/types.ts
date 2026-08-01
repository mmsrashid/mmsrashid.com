export interface HealthAppointment {
  id: string
  user_id: string
  appointment_date: string
  appointment_type: string
  doctor_name: string | null
  clinic_name: string | null
  status: 'upcoming' | 'completed' | 'cancelled'
  notes: string | null
  created_at: string
}

export interface HealthMedicine {
  id: string
  user_id: string
  name: string
  dose: number | null
  dose_unit: string | null
  frequency: string | null
  route: string | null
  start_date: string | null
  end_date: string | null
  prescribing_doctor: string | null
  status: 'active' | 'stopped'
  notes: string | null
  created_at: string
}

export interface BloodMarker {
  id: string
  name: string
  short_name: string | null
  category: string
  unit: string | null
  ref_low: number | null
  ref_high: number | null
  description: string | null
}

export interface BloodResult {
  id: string
  user_id: string
  marker_id: string
  value: number
  test_date: string
  lab_name: string | null
  document_id: string | null
  notes: string | null
  created_at: string
}

export interface BloodMarkerWithResults extends BloodMarker {
  results: BloodResult[]
  latest_value: number | null
  latest_date: string | null
  status: 'normal' | 'high' | 'low' | 'borderline' | 'unknown'
}

export interface HealthDocument {
  id: string
  user_id: string
  name: string
  type: 'blood_result' | 'letter' | 'scan' | 'prescription' | 'other'
  storage_path: string
  file_size_bytes: number | null
  extracted_marker_count: number
  tags: string[]
  created_at: string
}

export interface ExtractedMarker {
  marker_name: string
  value: number
  unit: string
  test_date: string
  lab_name?: string
}

/* ---------- Lifestyle logs ---------- */

export interface SleepLog {
  id: string
  user_id: string
  sleep_date: string
  total_hours: number | null
  quality_score: number | null
  bedtime: string | null
  wake_time: string | null
  notes: string | null
  created_at: string
}

export interface NutritionLog {
  id: string
  user_id: string
  log_date: string
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  water_ml: number | null
  notes: string | null
  created_at: string
}

export const INTENSITIES = ['low', 'moderate', 'high'] as const
export type Intensity = (typeof INTENSITIES)[number]

export interface ExerciseLog {
  id: string
  user_id: string
  exercise_date: string
  activity_type: string
  duration_min: number | null
  intensity: Intensity | null
  distance_km: number | null
  avg_heart_rate: number | null
  notes: string | null
  created_at: string
}

/* ---------- Multi-category ingest ---------- */

export const DOCUMENT_TYPES = ['blood_result', 'letter', 'scan', 'prescription', 'other'] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

/** 'low' means the model was unsure — the record is held back for confirmation. */
export type Confidence = 'high' | 'low'

export interface ExtractedBloodResult {
  marker_name: string
  value: number
  unit: string | null
  test_date: string | null
  lab_name: string | null
  confidence: Confidence
  /** Resolved server-side against health_blood_markers; null when no match. */
  marker_id?: string | null
  matched_name?: string | null
}

export interface ExtractedMedicine {
  name: string
  dose: number | null
  dose_unit: string | null
  frequency: string | null
  route: string | null
  start_date: string | null
  prescribing_doctor: string | null
  confidence: Confidence
}

export interface ExtractedAppointment {
  appointment_date: string | null
  appointment_type: string
  doctor_name: string | null
  clinic_name: string | null
  confidence: Confidence
}

export interface ExtractedSleep {
  sleep_date: string | null
  total_hours: number | null
  quality_score: number | null
  bedtime: string | null
  wake_time: string | null
  confidence: Confidence
}

export interface ExtractedNutrition {
  log_date: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  water_ml: number | null
  confidence: Confidence
}

export interface ExtractedExercise {
  exercise_date: string | null
  activity_type: string
  duration_min: number | null
  intensity: Intensity | null
  distance_km: number | null
  avg_heart_rate: number | null
  confidence: Confidence
}

export interface ExtractedPillLog {
  log_date: string | null
  medicine_name: string
  taken: boolean
  confidence: Confidence
  /** Resolved server-side against the user's active medicines. */
  medicine_id?: string | null
  matched_name?: string | null
}

export interface ExtractionResult {
  document_type: DocumentType
  tags: string[]
  summary: string
  blood_results: ExtractedBloodResult[]
  medicines: ExtractedMedicine[]
  appointments: ExtractedAppointment[]
  sleep: ExtractedSleep[]
  nutrition: ExtractedNutrition[]
  exercise: ExtractedExercise[]
  pill_logs: ExtractedPillLog[]
}

export type PendingKind =
  | 'blood_result' | 'medicine' | 'appointment'
  | 'sleep' | 'nutrition' | 'exercise' | 'pill_log'

export type PendingPayload =
  | ExtractedBloodResult | ExtractedMedicine | ExtractedAppointment
  | ExtractedSleep | ExtractedNutrition | ExtractedExercise | ExtractedPillLog

/** A record that was not auto-applied, with the reason why. */
export interface PendingRecord {
  kind: PendingKind
  reason: string
  record: PendingPayload
}

export interface AppliedCounts {
  blood_results: number
  medicines: number
  appointments: number
  sleep: number
  nutrition: number
  exercise: number
  pill_logs: number
}

export interface IngestResponse {
  document: HealthDocument
  summary: string
  applied: AppliedCounts
  pending: PendingRecord[]
  errors: string[]
}
