import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CATEGORY_KINDS, DEFAULT_CATEGORIES } from '@/lib/money/spending-types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('money_categories')
    .select('*')
    .order('sort_order')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Seed the starter set on first use, so the list lives with the code that
  // depends on it rather than in a migration that cannot be revised.
  if ((data ?? []).length === 0) {
    const seeded = DEFAULT_CATEGORIES.map((c, i) => ({
      user_id: user.id, name: c.name, kind: c.kind, sort_order: i,
    }))
    const { data: created, error: seedErr } = await supabase
      .from('money_categories')
      .insert(seeded)
      .select()
    if (seedErr) return NextResponse.json({ error: seedErr.message }, { status: 500 })
    return NextResponse.json(created ?? [])
  }

  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  if (!CATEGORY_KINDS.includes(body.kind)) {
    return NextResponse.json({ error: `kind must be one of: ${CATEGORY_KINDS.join(', ')}` }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('money_categories')
    .insert({ user_id: user.id, name, kind: body.kind, sort_order: Number(body.sort_order) || 0 })
    .select()
    .single()

  if (error) {
    const dup = error.code === '23505' || /duplicate key/i.test(error.message)
    return NextResponse.json(
      { error: dup ? 'A category with that name already exists.' : error.message },
      { status: dup ? 409 : 500 },
    )
  }
  return NextResponse.json(data)
}
