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
