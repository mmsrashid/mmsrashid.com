import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const daysParam = url.searchParams.get('days') ?? '30'
  // days=all returns the full history, needed for the adherence trend.
  const allTime = daysParam === 'all'
  const days = allTime ? 0 : parseInt(daysParam)

  const { data: medicines, error: mErr } = await supabase
    .from('health_medicines')
    .select('id, name, dose, dose_unit, frequency, status')
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  let query = supabase
    .from('health_pill_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('log_date', { ascending: true })

  if (!allTime) {
    const since = new Date()
    since.setDate(since.getDate() - days)
    query = query.gte('log_date', since.toISOString().slice(0, 10))
  }

  const { data: logs, error: lErr } = await query
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })

  return NextResponse.json({ medicines: medicines ?? [], logs: logs ?? [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  // body: { medicine_id, log_date, taken, taken_at? }
  const { data, error } = await supabase
    .from('health_pill_logs')
    .upsert(
      { ...body, user_id: user.id },
      { onConflict: 'user_id,medicine_id,log_date' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
