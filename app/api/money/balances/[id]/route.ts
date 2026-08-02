import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}

  if (body.balance !== undefined) {
    const n = Number(body.balance)
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: 'balance must be a number.' }, { status: 400 })
    }
    patch.balance = Math.round(n * 100) / 100
  }
  if (body.as_of !== undefined) {
    const asOf = String(body.as_of).slice(0, 10)
    if (asOf > new Date().toISOString().slice(0, 10)) {
      return NextResponse.json({ error: 'A balance cannot be dated in the future.' }, { status: 400 })
    }
    patch.as_of = asOf
  }
  if (body.notes !== undefined) patch.notes = body.notes || null

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('money_balances')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) {
    const dup = error.code === '23505' || /duplicate key/i.test(error.message)
    return NextResponse.json(
      { error: dup ? 'That account already has a balance on that date.' : error.message },
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

  const { error, count } = await supabase
    .from('money_balances')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
