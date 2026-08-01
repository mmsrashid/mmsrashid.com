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
    .from('health_exercise_logs')
    .select('*')
    .gte('exercise_date', since.toISOString().slice(0, 10))
    .order('exercise_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.exercise_date) {
    return NextResponse.json({ error: 'A date is required.' }, { status: 400 })
  }
  if (!body.activity_type?.trim()) {
    return NextResponse.json({ error: 'An activity type is required.' }, { status: 400 })
  }

  // Several sessions a day are normal, so these insert rather than upsert.
  const { data, error } = await supabase
    .from('health_exercise_logs')
    .insert({ ...body, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
