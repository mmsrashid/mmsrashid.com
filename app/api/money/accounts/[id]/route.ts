import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ACCOUNT_KINDS, ACCOUNT_STATUSES } from '@/lib/money/types'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 })
    patch.name = name
  }
  if (body.kind !== undefined) {
    if (!ACCOUNT_KINDS.includes(body.kind)) {
      return NextResponse.json({ error: `kind must be one of: ${ACCOUNT_KINDS.join(', ')}` }, { status: 400 })
    }
    patch.kind = body.kind
  }
  if (body.status !== undefined) {
    if (!ACCOUNT_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "status must be 'active' or 'closed'." }, { status: 400 })
    }
    patch.status = body.status
  }
  for (const k of ['institution', 'notes'] as const) {
    if (body[k] !== undefined) patch[k] = body[k] || null
  }
  if (body.currency !== undefined) patch.currency = String(body.currency).toUpperCase()
  if (body.opened_date !== undefined) patch.opened_date = body.opened_date || null
  if (body.closed_date !== undefined) patch.closed_date = body.closed_date || null

  // Closing implies an end date and reopening clears it. Derived here so no
  // caller can forget: the Medicines tab's Stop button sent `status` alone and
  // left `end_date` null, which kept a stopped drug in the adherence
  // denominator. `closed_date` feeds the net worth series the same way.
  if (patch.status !== undefined && body.closed_date === undefined) {
    patch.closed_date = patch.status === 'closed'
      ? new Date().toISOString().slice(0, 10)
      : null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('money_accounts')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) {
    const dup = error.code === '23505' || /duplicate key/i.test(error.message)
    return NextResponse.json(
      { error: dup ? 'An active account already has that name.' : error.message },
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

  // money_balances cascades on account_id, so this removes the account's whole
  // balance history. Closing is the right move for an account that simply
  // ended; the UI must say so before calling this.
  const { error, count } = await supabase
    .from('money_accounts')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
