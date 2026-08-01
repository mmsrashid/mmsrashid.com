import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Adds a marker to the shared catalogue so a lab name we don't recognise can be
 * filed without a code change. The catalogue is global, hence the exact-name
 * conflict guard rather than a per-user row.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const name = String(body.name ?? '').trim()
  const category = String(body.category ?? '').trim()
  if (!name) return NextResponse.json({ error: 'A marker name is required.' }, { status: 400 })
  if (!category) return NextResponse.json({ error: 'A category is required.' }, { status: 400 })

  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))

  const { data: existing } = await supabase
    .from('health_blood_markers')
    .select('*')
    .ilike('name', name)
    .maybeSingle()
  if (existing) return NextResponse.json({ marker: existing, created: false })

  const { data, error } = await supabase
    .from('health_blood_markers')
    .insert({
      name,
      short_name: body.short_name ? String(body.short_name).trim() : null,
      category,
      unit: body.unit ? String(body.unit).trim() : null,
      ref_low: num(body.ref_low),
      ref_high: num(body.ref_high),
      description: body.description ? String(body.description).trim() : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ marker: data, created: true })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: markers, error: mErr } = await supabase
    .from('health_blood_markers')
    .select('*')
    .order('category')

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  const { data: results, error: rErr } = await supabase
    .from('health_blood_results')
    .select('*')
    .eq('user_id', user.id)
    .order('test_date', { ascending: false })

  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

  const resultsByMarker = (results || []).reduce<Record<string, typeof results>>((acc, r) => {
    if (!acc[r.marker_id]) acc[r.marker_id] = []
    acc[r.marker_id]!.push(r)
    return acc
  }, {})

  const enriched = (markers || []).map(m => {
    const mrs = resultsByMarker[m.id] || []
    const latest = mrs[0]
    let status: string = 'unknown'
    if (latest) {
      const v = latest.value
      if (m.ref_low !== null && v < m.ref_low) status = 'low'
      else if (m.ref_high !== null && v > m.ref_high) status = 'high'
      else status = 'normal'
    }
    return { ...m, results: mrs.slice(0, 10), latest_value: latest?.value ?? null, latest_date: latest?.test_date ?? null, status }
  })

  return NextResponse.json(enriched)
}
