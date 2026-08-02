import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Stop, restart or correct a medicine. Stopping is the right move for a drug
 * genuinely discontinued: the row keeps its pill-log history and drops out of
 * the tracker's daily denominator. Deleting is for rows that should never have
 * existed.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}

  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'stopped') {
      return NextResponse.json({ error: 'status must be active or stopped.' }, { status: 400 })
    }
    patch.status = body.status
  }
  for (const k of ['name', 'frequency', 'route', 'dose_unit', 'prescribing_doctor', 'notes'] as const) {
    if (body[k] !== undefined) patch[k] = body[k] || null
  }
  if (body.dose !== undefined) patch.dose = body.dose === null || body.dose === '' ? null : Number(body.dose)
  // Dates matter for adherence: a medicine shouldn't be scored before it started.
  if (body.start_date !== undefined) patch.start_date = body.start_date || null
  if (body.end_date !== undefined) patch.end_date = body.end_date || null

  // Stopping implies an end date and restarting clears it. Derive it here rather
  // than in each caller: the UI's Stop button sent status alone, which left the
  // row stopped with no end date while other paths stamped one.
  if (patch.status !== undefined && body.end_date === undefined) {
    patch.end_date = patch.status === 'stopped' ? new Date().toISOString().slice(0, 10) : null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('health_medicines')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) {
    // Reactivating a drug whose name already exists among the active rows trips
    // the partial unique index.
    const conflict = error.code === '23505' || /duplicate key/i.test(error.message)
    return NextResponse.json(
      { error: conflict ? 'Another active medicine already has that name.' : error.message },
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

  // health_pill_logs cascades on medicine_id, so this also removes the
  // adherence history for this drug. The UI warns about that.
  const { error, count } = await supabase
    .from('health_medicines')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
