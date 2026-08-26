import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CATEGORY_KINDS, DEFAULT_CATEGORIES } from '@/lib/money/spending-types'
import { PROPERTY_CATEGORY_SEED, PROPERTY_TREATMENTS } from '@/lib/money/property-types'

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
    return NextResponse.json(await withPropertySeed(supabase, user.id, created ?? []))
  }

  return NextResponse.json(await withPropertySeed(supabase, user.id, data ?? []))
}

type CategoryRow = { id: string; name: string; property_treatment?: string | null }

/**
 * Adds any missing property categories.
 *
 * Separate from the initial seed because the starter set was created before
 * property support existed — a user who already has categories would otherwise
 * never receive the property ones, and every property transaction would land as
 * unclassified with no category available to fix it.
 */
async function withPropertySeed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  existing: CategoryRow[],
): Promise<CategoryRow[]> {
  const have = new Set(existing.map(c => c.name.toLowerCase()))
  const missing = PROPERTY_CATEGORY_SEED.filter(c => !have.has(c.name.toLowerCase()))
  if (missing.length === 0) return existing

  const { data: added } = await supabase
    .from('money_categories')
    .insert(missing.map((c, i) => ({
      user_id: userId,
      name: c.name,
      kind: c.kind,
      property_treatment: c.property_treatment,
      sort_order: 100 + i,
    })))
    .select()

  return [...existing, ...((added ?? []) as CategoryRow[])]
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
    .insert({
      user_id: user.id,
      name,
      kind: body.kind,
      sort_order: Number(body.sort_order) || 0,
      property_treatment: PROPERTY_TREATMENTS.includes(body.property_treatment)
        ? body.property_treatment
        : null,
    })
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
