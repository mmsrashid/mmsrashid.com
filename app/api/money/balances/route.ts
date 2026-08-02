import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { BALANCE_SOURCES } from '@/lib/money/types'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accountId = new URL(req.url).searchParams.get('account_id')

  // Paged: PostgREST caps at 1000 rows by default, and a truncated net worth
  // series looks self-consistent, so it is worse than an error.
  const PAGE = 1000
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('money_balances')
      .select('*')
      .order('as_of', { ascending: true })
      .range(from, from + PAGE - 1)
    if (accountId) q = q.eq('account_id', accountId)

    const { data: page, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows.push(...(page ?? []))
    if (!page || page.length < PAGE) break
  }
  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.account_id) {
    return NextResponse.json({ error: 'account_id is required.' }, { status: 400 })
  }
  if (!body.as_of) {
    return NextResponse.json({ error: 'as_of is required.' }, { status: 400 })
  }

  const balance = Number(body.balance)
  if (body.balance === null || body.balance === undefined || body.balance === '' || !Number.isFinite(balance)) {
    return NextResponse.json({ error: 'balance must be a number.' }, { status: 400 })
  }

  const asOf = String(body.as_of).slice(0, 10)
  // A balance dated in the future is a typo, not intent.
  if (asOf > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ error: 'A balance cannot be dated in the future.' }, { status: 400 })
  }

  // Confirm the account is the caller's; RLS would block a foreign insert but
  // the error would be opaque.
  const { data: account } = await supabase
    .from('money_accounts')
    .select('id')
    .eq('id', body.account_id)
    .maybeSingle()
  if (!account) return NextResponse.json({ error: 'Unknown account.' }, { status: 400 })

  const source = BALANCE_SOURCES.includes(body.source) ? body.source : 'manual'

  const { data, error } = await supabase
    .from('money_balances')
    .upsert({
      user_id: user.id,
      account_id: body.account_id,
      as_of: asOf,
      balance: Math.round(balance * 100) / 100,
      source,
      document_id: body.document_id || null,
      notes: body.notes || null,
    }, { onConflict: 'user_id,account_id,as_of' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
