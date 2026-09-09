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

  const fields = {
    pattern, match_type: body.match_type,
    category_id: body.category_id, priority: Number(body.priority) || 100,
    // One rule can set both category and property. The four property codes are
    // distinctive strings, so matching on them is unusually reliable.
    property_id: body.property_id || null,
  }

  // The same pattern updates its rule rather than adding a second one.
  //
  // Pressing Rule on a second transaction from the same merchant is the natural
  // way to correct a rule, but it used to insert a duplicate. Real data ended up
  // with PEPPER MONEY three times and SOUZA SILVA L three times, and where one
  // copy assigned a property and another did not, the older copy could win — so
  // the fix looked like it had not saved.
  // Matched case-insensitively, because RULE MATCHING is case-insensitive.
  // An exact comparison here let "Edf Energy" and "EDF ENERGY" become two
  // rules that behave identically but can disagree about the category — and
  // with both at the same priority, which one won was arbitrary. That is how
  // 104 property utility payments ended up in the personal book.
  const { data: existing } = await supabase
    .from('money_category_rules')
    .select('id')
    .ilike('pattern', pattern)
    .eq('match_type', body.match_type)
    .maybeSingle()

  const q = existing
    ? supabase.from('money_category_rules').update(fields).eq('id', existing.id)
    : supabase.from('money_category_rules').insert({ user_id: user.id, ...fields })

  const { data, error } = await q.select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, replaced_existing: Boolean(existing) })
}
