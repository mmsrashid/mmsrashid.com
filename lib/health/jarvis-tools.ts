import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BloodMarker, BloodResult } from './types'

/**
 * Health tools for JARVIS. Without these it can only see email and calendar,
 * so it has to tell the user it has no visibility into their health records.
 *
 * All queries rely on RLS for scoping; user_id is passed only where a write
 * needs it explicitly.
 */
export const HEALTH_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_health_overview',
    description:
      'Counts and highlights across the whole health record: flagged blood markers, next appointment, active medicines, and how much lifestyle data exists. Use this first for broad questions like "how am I doing".',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_blood_markers',
    description:
      'Blood test markers with their latest value, reference range, status and reading count. Use for questions about a specific analyte or panel.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Filter by marker name, e.g. "cholesterol".' },
        category: { type: 'string', description: 'Filter by category, e.g. "Lipids".' },
        only_with_results: { type: 'boolean', description: 'Default true. Set false to include markers never measured.' },
        flagged_only: { type: 'boolean', description: 'Only markers currently out of range.' },
      },
      required: [],
    },
  },
  {
    name: 'get_marker_history',
    description: 'Every recorded reading for one marker, oldest first, for questions about a trend.',
    input_schema: {
      type: 'object' as const,
      properties: { marker_name: { type: 'string', description: 'Marker name as shown in the app.' } },
      required: ['marker_name'],
    },
  },
  {
    name: 'get_medicines',
    description: 'Medicines on record with dose, frequency, route and prescriber.',
    input_schema: {
      type: 'object' as const,
      properties: { include_stopped: { type: 'boolean', description: 'Default false.' } },
      required: [],
    },
  },
  {
    name: 'get_appointments',
    description: 'Appointments on record, soonest upcoming first.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_lifestyle_logs',
    description: 'Sleep, nutrition or exercise logs, most recent first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        kind: { type: 'string', enum: ['sleep', 'nutrition', 'exercise'] },
        limit: { type: 'number', description: 'Default 14, max 90.' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'get_pill_adherence',
    description: 'Pill tracker adherence: percentage per day plus an overall average.',
    input_schema: {
      type: 'object' as const,
      properties: { days: { type: 'number', description: 'Days to look back. Default 30, max 400.' } },
      required: [],
    },
  },
  {
    name: 'add_blood_marker',
    description:
      'Add a marker to the catalogue so an unrecognised lab name can be filed. Use when the user says a marker is missing. Omit the reference range if you are not certain of the units, rather than guessing — a wrong range mislabels results as normal.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name exactly as the lab prints it.' },
        category: {
          type: 'string',
          description: 'One of: Full Blood Count, Liver Function, Thyroid, Lipids, Metabolic, Vitamins & Minerals, Hormones, Inflammatory.',
        },
        short_name: { type: 'string' },
        unit: { type: 'string' },
        ref_low: { type: ['number', 'null'] },
        ref_high: { type: ['number', 'null'] },
      },
      required: ['name', 'category'],
    },
  },
]

export const HEALTH_TOOL_NAMES = new Set(HEALTH_TOOLS.map(t => t.name))

type DB = SupabaseClient
const json = (v: unknown) => JSON.stringify(v, null, 2)

function statusOf(value: number | null, low: number | null, high: number | null) {
  if (value == null) return 'unknown'
  if (low != null && value < low) return 'low'
  if (high != null && value > high) return 'high'
  if (low == null && high == null) return 'unknown'
  return 'normal'
}

async function markersWithLatest(supabase: DB) {
  const [{ data: markers }, { data: results }] = await Promise.all([
    supabase.from('health_blood_markers').select('*'),
    supabase.from('health_blood_results').select('*').order('test_date', { ascending: false }),
  ])
  const byMarker = new Map<string, BloodResult[]>()
  for (const r of (results ?? []) as BloodResult[]) {
    const arr = byMarker.get(r.marker_id) ?? []
    arr.push(r)
    byMarker.set(r.marker_id, arr)
  }
  return ((markers ?? []) as BloodMarker[]).map(m => {
    const rs = byMarker.get(m.id) ?? []
    const latest = rs[0] ?? null
    return {
      name: m.name,
      category: m.category,
      unit: m.unit,
      reference: m.ref_low == null && m.ref_high == null ? null : { low: m.ref_low, high: m.ref_high },
      latest_value: latest?.value ?? null,
      latest_date: latest?.test_date ?? null,
      status: statusOf(latest?.value ?? null, m.ref_low, m.ref_high),
      readings: rs.length,
      _id: m.id,
    }
  })
}

export async function executeHealthTool(
  name: string,
  input: Record<string, unknown>,
  supabase: DB,
  userId: string,
): Promise<string> {
  if (name === 'get_health_overview') {
    const enriched = await markersWithLatest(supabase)
    const [{ data: meds }, { data: appts }, { count: sleepCount }, { count: nutritionCount }, { count: exerciseCount }] =
      await Promise.all([
        supabase.from('health_medicines').select('name, status'),
        supabase.from('health_appointments').select('*').order('appointment_date', { ascending: true }),
        supabase.from('health_sleep_logs').select('*', { count: 'exact', head: true }),
        supabase.from('health_nutrition_logs').select('*', { count: 'exact', head: true }),
        supabase.from('health_exercise_logs').select('*', { count: 'exact', head: true }),
      ])
    const measured = enriched.filter(m => m.latest_value != null)
    const now = new Date().toISOString()
    return json({
      blood: {
        markers_measured: measured.length,
        total_readings: measured.reduce((s, m) => s + m.readings, 0),
        flagged: measured.filter(m => m.status === 'high' || m.status === 'low')
          .map(m => ({ name: m.name, value: m.latest_value, unit: m.unit, status: m.status, date: m.latest_date })),
      },
      medicines: { active: (meds ?? []).filter(m => m.status === 'active').map(m => m.name) },
      appointments: {
        next: (appts ?? []).find(a => a.appointment_date >= now) ?? null,
        total: (appts ?? []).length,
      },
      lifestyle: { sleep_nights: sleepCount ?? 0, nutrition_days: nutritionCount ?? 0, exercise_sessions: exerciseCount ?? 0 },
    })
  }

  if (name === 'get_blood_markers') {
    const onlyWith = input.only_with_results !== false
    const search = String(input.search ?? '').toLowerCase()
    const category = String(input.category ?? '').toLowerCase()
    let list = await markersWithLatest(supabase)
    if (onlyWith) list = list.filter(m => m.latest_value != null)
    if (input.flagged_only) list = list.filter(m => m.status === 'high' || m.status === 'low')
    if (search) list = list.filter(m => m.name.toLowerCase().includes(search))
    if (category) list = list.filter(m => m.category.toLowerCase().includes(category))
    return json(list.map(({ _id, ...rest }) => rest))
  }

  if (name === 'get_marker_history') {
    const wanted = String(input.marker_name ?? '').toLowerCase()
    const list = await markersWithLatest(supabase)
    const marker = list.find(m => m.name.toLowerCase() === wanted)
      ?? list.find(m => m.name.toLowerCase().includes(wanted))
    if (!marker) return `No marker matching "${input.marker_name}".`
    const { data } = await supabase
      .from('health_blood_results')
      .select('value, test_date, lab_name')
      .eq('marker_id', marker._id)
      .order('test_date', { ascending: true })
    return json({ marker: marker.name, unit: marker.unit, reference: marker.reference, readings: data ?? [] })
  }

  if (name === 'get_medicines') {
    const { data } = await supabase
      .from('health_medicines')
      .select('name, dose, dose_unit, frequency, route, start_date, prescribing_doctor, status')
      .order('name')
    const list = input.include_stopped ? (data ?? []) : (data ?? []).filter(m => m.status === 'active')
    return json(list)
  }

  if (name === 'get_appointments') {
    const { data } = await supabase
      .from('health_appointments')
      .select('appointment_date, appointment_type, doctor_name, clinic_name, status, notes')
      .order('appointment_date', { ascending: true })
    return json(data ?? [])
  }

  if (name === 'get_lifestyle_logs') {
    const kind = String(input.kind ?? '')
    const limit = Math.min(Number(input.limit) || 14, 90)
    const table = kind === 'sleep' ? 'health_sleep_logs'
      : kind === 'nutrition' ? 'health_nutrition_logs'
      : kind === 'exercise' ? 'health_exercise_logs' : null
    if (!table) return `Unknown kind "${kind}". Use sleep, nutrition or exercise.`
    const dateCol = kind === 'sleep' ? 'sleep_date' : kind === 'nutrition' ? 'log_date' : 'exercise_date'
    const { data } = await supabase.from(table).select('*').order(dateCol, { ascending: false }).limit(limit)
    return json(data ?? [])
  }

  if (name === 'get_pill_adherence') {
    const days = Math.min(Number(input.days) || 30, 400)
    const since = new Date()
    since.setDate(since.getDate() - days)
    const [{ data: meds }, { data: logs }] = await Promise.all([
      supabase.from('health_medicines').select('id, name').eq('status', 'active'),
      supabase.from('health_pill_logs').select('log_date, taken')
        .gte('log_date', since.toISOString().slice(0, 10))
        .order('log_date', { ascending: true }),
    ])
    const byDate = new Map<string, { taken: number; total: number }>()
    for (const l of logs ?? []) {
      const e = byDate.get(l.log_date) ?? { taken: 0, total: 0 }
      e.total++
      if (l.taken) e.taken++
      byDate.set(l.log_date, e)
    }
    const perDay = [...byDate.entries()].map(([date, v]) => ({
      date, taken: v.taken, of: v.total, pct: Math.round((v.taken / v.total) * 100),
    }))
    const avg = perDay.length ? Math.round(perDay.reduce((s, d) => s + d.pct, 0) / perDay.length) : null
    return json({ active_medicines: (meds ?? []).length, days_logged: perDay.length, average_pct: avg, per_day: perDay })
  }

  if (name === 'add_blood_marker') {
    const markerName = String(input.name ?? '').trim()
    const category = String(input.category ?? '').trim()
    if (!markerName || !category) return 'Both name and category are required.'

    const { data: existing } = await supabase
      .from('health_blood_markers').select('name, category, unit').ilike('name', markerName).maybeSingle()
    if (existing) return json({ created: false, reason: 'Already in the catalogue', marker: existing })

    const { data, error } = await supabase.from('health_blood_markers').insert({
      name: markerName,
      category,
      short_name: input.short_name ? String(input.short_name).trim() : null,
      unit: input.unit ? String(input.unit).trim() : null,
      ref_low: input.ref_low == null ? null : Number(input.ref_low),
      ref_high: input.ref_high == null ? null : Number(input.ref_high),
    }).select().single()

    if (error) return `Could not add marker: ${error.message}`
    return json({ created: true, marker: data, note: 'Re-upload the document and this marker will now file.' })
  }

  return `Unknown health tool: ${name}`
}
