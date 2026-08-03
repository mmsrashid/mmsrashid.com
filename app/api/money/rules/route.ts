import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { MATCH_TYPES } from '@/lib/money/spending-types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('money_category_rules').select('*').order('priority')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const pattern = String(body.pattern ?? '').trim()
  if (!pattern) return NextResponse.json({ error: 'A pattern is required.' }, { status: 400 })
  if (!MATCH_TYPES.includes(body.match_type)) {
    return NextResponse.json({ error: `match_type must be one of: ${MATCH_TYPES.join(', ')}` }, { status: 400 })
  }
  if (!body.category_id) {
    return NextResponse.json({ error: 'category_id is required.' }, { status: 400 })
  }
  // Reject a malformed regex at creation rather than letting it silently never
  // match every time an import runs.
  if (body.match_type === 'regex') {
    try { new RegExp(pattern) }
    catch { return NextResponse.json({ error: 'That is not a valid regular expression.' }, { status: 400 }) }
  }

  const { data, error } = await supabase
    .from('money_category_rules')
    .insert({
      user_id: user.id, pattern, match_type: body.match_type,
      category_id: body.category_id, priority: Number(body.priority) || 100,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
