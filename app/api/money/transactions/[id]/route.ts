import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}

  // A category set here is the user's own decision, so it is marked manual and
  // becomes immune to later rule and AI passes.
  if (body.category_id !== undefined) {
    patch.category_id = body.category_id || null
    patch.category_source = body.category_id ? 'manual' : null
  }
  if (body.merchant !== undefined) patch.merchant = body.merchant || null
  if (body.notes !== undefined) patch.notes = body.notes || null

  // Tagging a transaction to a property. Empty string clears it.
  if (body.property_id !== undefined) {
    if (!body.property_id) {
      patch.property_id = null
    } else {
      const { data: property } = await supabase
        .from('money_properties').select('id').eq('id', body.property_id).maybeSingle()
      if (!property) return NextResponse.json({ error: 'Unknown property.' }, { status: 400 })
      patch.property_id = body.property_id
    }
  }

  // The period a payment covers, for rent paid in advance. Both dates move
  // together: one alone cannot describe a period, and a half-filled pair would
  // silently fall back to cash treatment while looking as though it were set.
  if (body.covers_from !== undefined || body.covers_to !== undefined) {
    const from = body.covers_from || null
    const to = body.covers_to || null
    if ((from === null) !== (to === null)) {
      return NextResponse.json(
        { error: 'Give both a start and an end for the covered period, or neither.' },
        { status: 400 },
      )
    }
    if (from && to && to < from) {
      return NextResponse.json(
        { error: 'The covered period ends before it starts.' },
        { status: 400 },
      )
    }
    patch.covers_from = from
    patch.covers_to = to
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('money_transactions').update(patch).eq('id', id).select().maybeSingle()
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
    .from('money_transactions').delete({ count: 'exact' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
