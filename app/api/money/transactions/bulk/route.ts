import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { buildImportKeys } from '@/lib/money/dedupe-key'
import type { ParsedTransaction } from '@/lib/money/spending-types'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Files already-parsed transactions into an account.
 *
 * Exists because a run of historical statements is better parsed and CHECKED
 * before anything is written than uploaded one file at a time and inspected
 * afterwards. Each Barclays statement prints its opening and closing balance,
 * so a parse can be proved correct — start balance plus every movement must
 * equal the closing figure — and only then loaded.
 *
 * Categorisation is deliberately NOT run here. Rules are applied afterwards by
 * /api/money/transactions/categorise, which is resumable and reports what it
 * did; bundling them would make a large load all-or-nothing.
 */
const MAX_ROWS = 5000

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const accountId = String(body.account_id ?? '')
  if (!accountId) return NextResponse.json({ error: 'account_id is required.' }, { status: 400 })

  const { data: account } = await supabase
    .from('money_accounts').select('id, name').eq('id', accountId).maybeSingle()
  if (!account) return NextResponse.json({ error: 'No such account.' }, { status: 404 })

  const incoming = Array.isArray(body.rows) ? body.rows : null
  if (!incoming || incoming.length === 0) {
    return NextResponse.json({ error: 'rows must be a non-empty array.' }, { status: 400 })
  }
  if (incoming.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows in one call (${incoming.length}). Send at most ${MAX_ROWS}.` },
      { status: 400 },
    )
  }

  // Validated rather than trusted: a bad date or amount here would be stored
  // and then silently included in a tax figure.
  const rows: ParsedTransaction[] = []
  for (const [i, raw] of incoming.entries()) {
    const r = raw as Record<string, unknown>
    const txn_date = String(r.txn_date ?? '')
    const description = String(r.description ?? '').trim()
    const amount = Number(r.amount)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(txn_date)) {
      return NextResponse.json({ error: `Row ${i}: txn_date must be YYYY-MM-DD.` }, { status: 400 })
    }
    if (!description) {
      return NextResponse.json({ error: `Row ${i}: description is required.` }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount === 0) {
      return NextResponse.json({ error: `Row ${i}: amount must be a non-zero number.` }, { status: 400 })
    }
    rows.push({
      txn_date, description, amount,
      external_id: r.external_id ? String(r.external_id) : null,
    })
  }

  // The same keys the file importer uses, so a statement loaded this way and a
  // CSV covering the same period still recognise each other.
  const keys = buildImportKeys(accountId, rows)

  const { data: existing, error: keyErr } = await supabase
    .from('money_transactions')
    .select('dedupe_key')
    .eq('account_id', accountId)
    .in('dedupe_key', keys)
  if (keyErr) return NextResponse.json({ error: keyErr.message }, { status: 500 })

  const stored = new Set((existing ?? []).map(r => r.dedupe_key as string))
  const fresh = rows
    .map((row, i) => ({ row, key: keys[i] }))
    .filter(x => !stored.has(x.key))

  if (fresh.length === 0) {
    return NextResponse.json({
      account: account.name, received: rows.length, inserted: 0,
      duplicates: rows.length,
      note: 'Every row was already stored. Nothing was changed.',
    })
  }

  // Chunked: one statement run can be a few thousand rows, and a single
  // oversized insert is the kind of thing that fails at the far end.
  const CHUNK = 500
  let inserted = 0
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const payload = fresh.slice(i, i + CHUNK).map(x => ({
      user_id: user.id,
      account_id: accountId,
      txn_date: x.row.txn_date,
      description: x.row.description,
      amount: x.row.amount,
      external_id: x.row.external_id,
      dedupe_key: x.key,
    }))
    const { data, error } = await supabase
      .from('money_transactions')
      .upsert(payload, { onConflict: 'user_id,dedupe_key' })
      .select('id')
    if (error) {
      // Reports what did land rather than pretending the whole call failed.
      return NextResponse.json(
        { error: error.message, inserted, received: rows.length }, { status: 500 },
      )
    }
    inserted += (data ?? []).length
  }

  return NextResponse.json({
    account: account.name,
    received: rows.length,
    inserted,
    duplicates: rows.length - fresh.length,
  })
}
