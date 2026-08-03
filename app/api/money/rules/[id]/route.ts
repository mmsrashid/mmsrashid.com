import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { MATCH_TYPES } from '@/lib/money/spending-types'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.pattern !== undefined) {
    const p = String(body.pattern).trim()
    if (!p) return NextResponse.json({ error: 'Pattern cannot be empty.' }, { status: 400 })
    patch.pattern = p
  }
  if (body.match_type !== undefined) {
    if (!MATCH_TYPES.includes(body.match_type)) {
      return NextResponse.json({ error: `match_type must be one of: ${MATCH_TYPES.join(', ')}` }, { status: 400 })
    }
    patch.match_type = body.match_type
  }
  if (body.category_id !== undefined) patch.category_id = body.category_id
  if (body.priority !== undefined) patch.priority = Number(body.priority) || 100

  // Validate the regex against whatever the row will actually end up with, not
  // just what this request happened to include.
  if (patch.pattern !== undefined || patch.match_type !== undefined) {
    const { data: current } = await supabase
      .from('money_category_rules').select('pattern, match_type').eq('id', id).maybeSingle()
    const finalType = (patch.match_type ?? current?.match_type) as string | undefined
    const finalPattern = (patch.pattern ?? current?.pattern) as string | undefined
    if (finalType === 'regex' && finalPattern) {
      try { new RegExp(finalPattern) }
      catch { return NextResponse.json({ error: 'That is not a valid regular expression.' }, { status: 400 }) }
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('money_category_rules').update(patch).eq('id', id).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error, count } = await supabase
    .from('money_category_rules').delete({ count: 'exact' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
