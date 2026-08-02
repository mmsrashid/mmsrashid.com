import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { extractBalances, isSupportedMoneyMime } from '@/lib/money/extract'
import { buildAccountResolver } from '@/lib/money/match-account'
import { parseBalanceCsv } from '@/lib/money/parse-csv'
import type { ExtractedBalance } from '@/lib/money/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 20 * 1024 * 1024

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file supplied.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'That file is over 20MB.' }, { status: 413 })
  }

  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv'
  if (!isCsv && !isSupportedMoneyMime(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type "${file.type || 'unknown'}". Use a PDF, PNG, JPEG, WebP, GIF or CSV.` },
      { status: 415 },
    )
  }

  const { data: accounts } = await supabase
    .from('money_accounts')
    .select('id, name, institution')
  const resolve = buildAccountResolver(accounts ?? [])

  const bytes = Buffer.from(await file.arrayBuffer())

  let extracted: ExtractedBalance[]
  let docKind: 'csv' | 'statement' | 'screenshot'

  if (isCsv) {
    const parsed = parseBalanceCsv(bytes.toString('utf8'))
    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: parsed.errors[0] ?? 'Nothing readable in that CSV.' },
        { status: 400 },
      )
    }
    docKind = 'csv'
    // CSV values are typed, not inferred, so the only uncertainty is which
    // account a name refers to.
    extracted = parsed.rows.map(r => ({
      account_name: r.account_name,
      balance: r.balance,
      as_of: r.as_of,
      currency: null,
      confidence: 'high',
      account_id: null,
    }))
  } else {
    docKind = file.type === 'application/pdf' ? 'statement' : 'screenshot'
    try {
      extracted = await extractBalances({
        data: bytes.toString('base64'),
        mediaType: file.type || 'image/png',
      })
    } catch (err) {
      return NextResponse.json({ error: `Could not read that file: ${String(err)}` }, { status: 502 })
    }
    if (extracted.length === 0) {
      return NextResponse.json({ error: 'I could not find any balances in that file.' }, { status: 422 })
    }
  }

  // Store the source file so a figure can always be traced back to it.
  const path = `${user.id}/${Date.now()}-${file.name || 'upload'}`
  const { error: upErr } = await supabase.storage
    .from('money-documents')
    .upload(path, bytes, { contentType: file.type || 'application/octet-stream' })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: doc, error: docErr } = await supabase
    .from('money_documents')
    .insert({
      user_id: user.id,
      name: file.name || 'Upload',
      kind: docKind,
      storage_path: path,
      file_size_bytes: file.size,
      extracted_balance_count: extracted.length,
    })
    .select()
    .single()
  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 })

  const today = new Date().toISOString().slice(0, 10)
  const resolved = extracted.map(e => {
    const match = resolve(e.account_name)
    return { ...e, account_id: match?.id ?? null }
  })

  // Auto-apply only rows that are confident, matched to an account, and dated.
  // Everything else is held for review: an unreviewed wrong balance corrupts
  // the whole series from that date forward.
  const applied: unknown[] = []
  const pending: ExtractedBalance[] = []

  for (const r of resolved) {
    const ok = r.confidence === 'high' && r.account_id && r.as_of && r.as_of <= today
    if (!ok) { pending.push(r); continue }

    const { data, error } = await supabase
      .from('money_balances')
      .upsert({
        user_id: user.id,
        account_id: r.account_id,
        as_of: r.as_of,
        balance: r.balance,
        source: isCsv ? 'import' : 'document',
        document_id: doc.id,
      }, { onConflict: 'user_id,account_id,as_of' })
      .select()
      .single()

    if (error) pending.push(r)
    else applied.push(data)
  }

  return NextResponse.json({
    document_id: doc.id,
    applied: applied.length,
    pending,
    unmatched: resolved.filter(r => !r.account_id).map(r => r.account_name),
  })
}
