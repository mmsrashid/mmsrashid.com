import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { LOCATION_KINDS, OWNERSHIP_KINDS } from '@/lib/money/property-types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('money_properties')
    .select('*')
    .order('code')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const code = String(body.code ?? '').trim()
  if (!code) return NextResponse.json({ error: 'A code or name is required.' }, { status: 400 })

  const kind = body.kind ?? 'property'
  if (!LOCATION_KINDS.includes(kind)) {
    return NextResponse.json(
      { error: `kind must be one of: ${LOCATION_KINDS.join(', ')}` },
      { status: 400 },
    )
  }

  if (body.ownership !== undefined && !OWNERSHIP_KINDS.includes(body.ownership)) {
    return NextResponse.json(
      { error: `ownership must be one of: ${OWNERSHIP_KINDS.join(', ')}` },
      { status: 400 },
    )
  }

  // Share drives every figure in the P&L, so a nonsensical value would corrupt
  // the whole report rather than just one field.
  const share = body.share_percent === undefined || kind !== 'property'
    ? 100
    : Number(body.share_percent)
  if (!Number.isFinite(share) || share <= 0 || share > 100) {
    return NextResponse.json(
      { error: 'share_percent must be greater than 0 and at most 100.' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('money_properties')
    .insert({
      user_id: user.id,
      code,
      kind,
      label: body.label || null,
      ownership: body.ownership || 'personal',
      share_percent: share,
      acquired_date: body.acquired_date || null,
      notes: body.notes || null,
    })
    .select()
    .single()

  if (error) {
    const dup = error.code === '23505' || /duplicate key/i.test(error.message)
    return NextResponse.json(
      { error: dup ? `A property with code "${code}" already exists.` : error.message },
      { status: dup ? 409 : 500 },
    )
  }
  return NextResponse.json(data)
}
