import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ACCOUNT_KINDS } from '@/lib/money/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('money_accounts')
    .select('*')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  if (!ACCOUNT_KINDS.includes(body.kind)) {
    return NextResponse.json(
      { error: `kind must be one of: ${ACCOUNT_KINDS.join(', ')}` },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('money_accounts')
    .insert({
      user_id: user.id,
      name,
      institution: body.institution || null,
      kind: body.kind,
      currency: (body.currency || 'GBP').toUpperCase(),
      opened_date: body.opened_date || null,
      notes: body.notes || null,
    })
    .select()
    .single()

  if (error) {
    const dup = error.code === '23505' || /duplicate key/i.test(error.message)
    return NextResponse.json(
      { error: dup ? 'An active account already has that name.' : error.message },
      { status: dup ? 409 : 500 },
    )
  }
  return NextResponse.json(data)
}
