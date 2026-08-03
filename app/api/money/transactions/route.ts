import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { buildAppendKey, groupKey } from '@/lib/money/dedupe-key'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = new URL(req.url).searchParams
  const accountId = p.get('account_id')
  const from = p.get('from')
  const to = p.get('to')
  const categoryId = p.get('category_id')
  const uncategorised = p.get('uncategorised') === '1'

  // Paged: a year of statements is thousands of rows, and a truncated spending
  // total looks self-consistent, so it is worse than an error.
  const PAGE = 1000
  const rows: unknown[] = []
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from('money_transactions')
      .select('*')
      .order('txn_date', { ascending: false })
      .range(offset, offset + PAGE - 1)

    if (accountId) q = q.eq('account_id', accountId)
    if (from) q = q.gte('txn_date', from)
    if (to) q = q.lte('txn_date', to)
    if (categoryId) q = q.eq('category_id', categoryId)
    if (uncategorised) q = q.is('category_id', null)

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
  if (!body.account_id) return NextResponse.json({ error: 'account_id is required.' }, { status: 400 })

  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: 'amount must be a non-zero number.' }, { status: 400 })
  }

  const description = String(body.description ?? '').trim()
  if (!description) return NextResponse.json({ error: 'A description is required.' }, { status: 400 })

  const txnDate = String(body.txn_date ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txnDate)) {
    return NextResponse.json({ error: 'txn_date must be YYYY-MM-DD.' }, { status: 400 })
  }
  // One day of tolerance: statements occasionally carry a pending entry dated
  // tomorrow. More than that is a typo.
  const limit = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  if (txnDate > limit) {
    return NextResponse.json({ error: 'That date is too far in the future.' }, { status: 400 })
  }

  const { data: account } = await supabase
    .from('money_accounts').select('id').eq('id', body.account_id).maybeSingle()
  if (!account) return NextResponse.json({ error: 'Unknown account.' }, { status: 400 })

  // A hand-typed transaction asserts it happened in addition to what is stored,
  // so it appends rather than collapsing onto an identical existing row.
  const row = {
    txn_date: txnDate,
    description,
    amount,
    external_id: body.external_id || null,
  }
  const { data: existing } = await supabase
    .from('money_transactions')
    .select('dedupe_key, txn_date, description, amount')
    .eq('account_id', body.account_id)
    .eq('txn_date', txnDate)

  const target = groupKey(String(body.account_id), row)
  const sameGroup = new Set(
    (existing ?? [])
      .filter(r => groupKey(String(body.account_id), {
        txn_date: r.txn_date as string,
        description: r.description as string,
        amount: Number(r.amount),
        external_id: null,
      }) === target)
      .map(r => r.dedupe_key as string),
  )

  const dedupe_key = buildAppendKey(String(body.account_id), row, sameGroup)

  const { data, error } = await supabase
    .from('money_transactions')
    .upsert({
      user_id: user.id,
      account_id: body.account_id,
      txn_date: txnDate,
      description,
      merchant: body.merchant || null,
      amount: Math.round(amount * 100) / 100,
      category_id: body.category_id || null,
      category_source: body.category_id ? 'manual' : null,
      document_id: body.document_id || null,
      external_id: body.external_id || null,
      dedupe_key,
      notes: body.notes || null,
    }, { onConflict: 'user_id,dedupe_key' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
