import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CATEGORY_KINDS } from '@/lib/money/spending-types'

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
    if (!CATEGORY_KINDS.includes(body.kind)) {
      return NextResponse.json({ error: `kind must be one of: ${CATEGORY_KINDS.join(', ')}` }, { status: 400 })
    }
    patch.kind = body.kind
  }
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('money_categories').update(patch).eq('id', id).select().maybeSingle()
  if (error) {
    const dup = error.code === '23505' || /duplicate key/i.test(error.message)
    return NextResponse.json(
      { error: dup ? 'A category with that name already exists.' : error.message },
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

  // Transactions keep their history with category_id set to null (schema: on
  // delete set null); the category's rules cascade away, being unusable debris.
  const { count } = await supabase
    .from('money_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)

  const { error, count: deleted } = await supabase
    .from('money_categories').delete({ count: 'exact' }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ deleted: true, transactions_uncategorised: count ?? 0 })
}
