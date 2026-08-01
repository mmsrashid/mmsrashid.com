import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
