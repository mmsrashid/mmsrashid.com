import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/** Removes a single sleep entry. Scoped to the caller by RLS. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error, count } = await supabase
    .from('health_sleep_logs')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
