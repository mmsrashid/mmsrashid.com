import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/** Correct a single reading. Only value, date, lab and notes are editable. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}

  if (body.value !== undefined) {
    const n = Number(body.value)
    if (!Number.isFinite(n)) return NextResponse.json({ error: 'Value must be a number.' }, { status: 400 })
    patch.value = n
  }
  if (body.test_date !== undefined) {
    if (!body.test_date) return NextResponse.json({ error: 'A test date is required.' }, { status: 400 })
    patch.test_date = body.test_date
  }
  if (body.lab_name !== undefined) patch.lab_name = body.lab_name || null
  if (body.notes !== undefined) patch.notes = body.notes || null

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('health_blood_results')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) {
    // The (user_id, marker_id, test_date) constraint means moving a reading onto
    // a date that already has one is a conflict, not a generic failure.
    const conflict = error.code === '23505' || /duplicate key/i.test(error.message)
    return NextResponse.json(
      { error: conflict ? 'There is already a reading for this marker on that date.' : error.message },
      { status: conflict ? 409 : 500 },
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

  // RLS scopes this to the caller's own readings.
  const { error, count } = await supabase
    .from('health_blood_results')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
