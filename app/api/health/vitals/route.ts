import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { VITAL_SOURCES } from '@/lib/health/types'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const daysParam = new URL(req.url).searchParams.get('days') ?? 'all'
  const allTime = daysParam === 'all'

  // Paged, because a watch sync will produce far more than PostgREST's default
  // 1000-row ceiling and a silently truncated chart is worse than none.
  const PAGE = 1000
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('health_vitals')
      .select('*')
      .order('measured_at', { ascending: true })
      .range(from, from + PAGE - 1)

    if (!allTime) {
      const since = new Date()
      since.setDate(since.getDate() - Number(daysParam))
      q = q.gte('measured_at', since.toISOString())
    }

    const { data: page, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows.push(...(page ?? []))
    if (!page || page.length < PAGE) break
  }

  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.measured_at) {
    return NextResponse.json({ error: 'measured_at is required.' }, { status: 400 })
  }

  const int = (v: unknown) => (v === null || v === undefined || v === '' ? null : Math.round(Number(v)))
  const systolic = int(body.systolic)
  const diastolic = int(body.diastolic)
  const heart_rate = int(body.heart_rate)

  if (systolic == null && diastolic == null && heart_rate == null && !body.metrics) {
    return NextResponse.json({ error: 'Record at least one measurement.' }, { status: 400 })
  }
  // A lone half of a blood pressure is almost always a typo rather than intent.
  if ((systolic == null) !== (diastolic == null)) {
    return NextResponse.json(
      { error: 'Blood pressure needs both systolic and diastolic.' },
      { status: 400 },
    )
  }
  if (systolic != null && diastolic != null && diastolic >= systolic) {
    return NextResponse.json(
      { error: 'Systolic must be higher than diastolic — check the two numbers.' },
      { status: 400 },
    )
  }

  const source = VITAL_SOURCES.includes(body.source) ? body.source : 'manual'

  const { data, error } = await supabase
    .from('health_vitals')
    .upsert({
      user_id: user.id,
      measured_at: new Date(body.measured_at).toISOString(),
      systolic, diastolic, heart_rate,
      metrics: body.metrics ?? {},
      source,
      notes: body.notes || null,
    }, { onConflict: 'user_id,measured_at,source' })
    .select()
    .single()

  if (error) {
    // The table's range checks are the backstop against a mistyped reading, but
    // raw Postgres text ("violates check constraint health_vitals_sy…") is no
    // use to someone entering a number by hand. Name the field instead.
    const bad = /check constraint "health_vitals_(\w+?)_check"/.exec(error.message)
    if (bad) {
      const limits: Record<string, string> = {
        systolic: 'systolic must be between 40 and 300',
        diastolic: 'diastolic must be between 20 and 200',
        heart_rate: 'heart rate must be between 20 and 250',
      }
      return NextResponse.json(
        { error: `That reading looks out of range — ${limits[bad[1]] ?? 'check the values'}.` },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
