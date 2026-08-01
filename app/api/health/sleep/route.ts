import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const days = Number(new URL(req.url).searchParams.get('days') ?? 60)
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('health_sleep_logs')
    .select('*')
    .gte('sleep_date', since.toISOString().slice(0, 10))
    .order('sleep_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.sleep_date) {
    return NextResponse.json({ error: 'A date is required.' }, { status: 400 })
  }

  // One row per night — re-logging a date replaces it rather than duplicating.
  const { data, error } = await supabase
    .from('health_sleep_logs')
    .upsert({ ...body, user_id: user.id }, { onConflict: 'user_id,sleep_date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
