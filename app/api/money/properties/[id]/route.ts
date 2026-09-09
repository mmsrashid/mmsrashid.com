import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { LOCATION_KINDS, OWNERSHIP_KINDS, PROPERTY_STATUSES } from '@/lib/money/property-types'
import { localToday } from '@/lib/local-date'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}

  if (body.code !== undefined) {
    const code = String(body.code).trim()
    if (!code) return NextResponse.json({ error: 'Code cannot be empty.' }, { status: 400 })
    patch.code = code
  }
  if (body.kind !== undefined) {
    if (!LOCATION_KINDS.includes(body.kind)) {
      return NextResponse.json(
        { error: `kind must be one of: ${LOCATION_KINDS.join(', ')}` },
        { status: 400 },
      )
    }
    patch.kind = body.kind
  }

  if (body.ownership !== undefined) {
    if (!OWNERSHIP_KINDS.includes(body.ownership)) {
      return NextResponse.json({ error: `ownership must be one of: ${OWNERSHIP_KINDS.join(', ')}` }, { status: 400 })
    }
    patch.ownership = body.ownership
  }
  if (body.status !== undefined) {
    if (!PROPERTY_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "status must be 'active' or 'sold'." }, { status: 400 })
    }
    patch.status = body.status
  }
  if (body.share_percent !== undefined) {
    const share = Number(body.share_percent)
    if (!Number.isFinite(share) || share <= 0 || share > 100) {
      return NextResponse.json({ error: 'share_percent must be greater than 0 and at most 100.' }, { status: 400 })
    }
    patch.share_percent = share
  }
  for (const k of ['label', 'notes'] as const) {
    if (body[k] !== undefined) patch[k] = body[k] || null
  }
  if (body.acquired_date !== undefined) patch.acquired_date = body.acquired_date || null
  if (body.disposed_date !== undefined) patch.disposed_date = body.disposed_date || null

  // Selling implies a disposal date and reverting clears it. Derived here so no
  // caller can forget — the same rule as closed_date on an account and end_date
  // on a medicine. A sold property with no disposal date would stay in the P&L
  // for ever.
  if (patch.status !== undefined && body.disposed_date === undefined) {
    patch.disposed_date = patch.status === 'sold' ? localToday() : null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('money_properties').update(patch).eq('id', id).select().maybeSingle()

  if (error) {
    const dup = error.code === '23505' || /duplicate key/i.test(error.message)
    return NextResponse.json(
      { error: dup ? 'Another property already has that code.' : error.message },
      { status: dup ? 409 : 500 },
    )
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Transactions keep their history with property_id set to null (schema: on
  // delete set null) — the money moved whether or not you still track the
  // property. Rules pointing at it cascade away, being unusable.
  const { count } = await supabase
    .from('money_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', id)

  const { error, count: deleted } = await supabase
    .from('money_properties').delete({ count: 'exact' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ deleted: true, transactions_untagged: count ?? 0 })
}
