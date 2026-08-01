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
    .from('health_nutrition_logs')
    .select('*')
    .gte('log_date', since.toISOString().slice(0, 10))
    .order('log_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.log_date) {
    return NextResponse.json({ error: 'A date is required.' }, { status: 400 })
  }

  // Daily totals — re-logging a date replaces it rather than duplicating.
  const { data, error } = await supabase
    .from('health_nutrition_logs')
    .upsert({ ...body, user_id: user.id }, { onConflict: 'user_id,log_date' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
