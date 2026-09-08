import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { extractBalances, isSupportedMoneyMime } from '@/lib/money/extract'
import { buildAccountResolver } from '@/lib/money/match-account'
import { parseBalanceCsv } from '@/lib/money/parse-csv'
import { parseTransactionCsv } from '@/lib/money/parse-transaction-csv'
import { extractTransactions } from '@/lib/money/extract-transactions'
import { buildImportKeys } from '@/lib/money/dedupe-key'
import { applyRules } from '@/lib/money/categorise'
import { suggestCategories, type CategorySuggestion } from '@/lib/money/suggest-categories'
import type { ExtractedBalance } from '@/lib/money/types'
import type { MoneyCategory, MoneyCategoryRule, ParsedTransaction } from '@/lib/money/spending-types'

export const runtime = 'nodejs'
// Importing three years of statements is a big job. The platform may clamp this
// to a lower ceiling on the current plan, which is why the categorisation step
// has its own budget and the transactions are written before it runs.
export const maxDuration = 300

const MAX_BYTES = 20 * 1024 * 1024

/**
 * Vercel kills the function at maxDuration. Categorisation is an enrichment
 * step, so it must never be the reason a whole import is lost — it runs only
 * while there is budget left, and whatever it does not reach stays visibly
 * uncategorised for a later pass.
 */
const AI_BUDGET_MS = 35_000

export async function POST(req: Request) {
  const startedAt = Date.now()
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
    const text = bytes.toString('utf8')
    const parsed = parseBalanceCsv(text)
    docKind = 'csv'

    if (parsed.rows.length === 0) {
      // A transaction feed has no account or balance columns, so the balance
      // parser rightly finds nothing. Refusing the file here meant a Starling
      // export was rejected before the transaction parser ever saw it.
      const asTransactions = parseTransactionCsv(text)
      if (asTransactions.rows.length === 0) {
        return NextResponse.json(
          {
            error:
              'I could not read that as either a balance list or a transaction feed. ' +
              `Balance parser said: ${parsed.errors[0] ?? 'nothing found'}. ` +
              `Transaction parser said: ${asTransactions.errors[0] ?? 'nothing found'}.`,
          },
          { status: 400 },
        )
      }
      extracted = []
    } else {
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
    }
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

  // Which account is this statement for? If the balances all resolved to one
  // account, that is the answer. If they disagree, or none matched, the
  // transactions cannot be filed safely and are reported back instead.
  const resolvedIds = [...new Set(resolved.map(r => r.account_id).filter(Boolean))]
  const singleAccount = (accounts ?? []).length === 1 ? (accounts ?? [])[0] : null
  const targetAccountId = (resolvedIds.length === 1 ? (resolvedIds[0] as string) : null)
    ?? singleAccount?.id
    ?? null

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

  /* ---- Transactions ---- */
  // A statement carries both a closing balance and a transaction list, so one
  // upload should populate both rather than needing two.
  let txnResult: {
    filed: number
    skipped_duplicates: number
    low_confidence: number
    unresolved_account: boolean
    ai_categorised: number
    left_uncategorised?: number
    proposed_rules: CategorySuggestion[]
    warning: string | null
  } | null = null

  {
    let parsed: ParsedTransaction[] = []
    let lowConfidence: ParsedTransaction[] = []
    let warning: string | null = null

    if (isCsv) {
      const r = parseTransactionCsv(bytes.toString('utf8'))
      parsed = r.rows
      if (r.errors.length && r.rows.length === 0) warning = r.errors[0]
    } else {
      try {
        const r = await extractTransactions({
          data: bytes.toString('base64'),
          mediaType: file.type || 'image/png',
        })
        parsed = r.rows
        lowConfidence = r.lowConfidence
        warning = r.warning
      } catch (err) {
        // The balances above are already filed; losing them because the
        // transaction pass failed would be worse than reporting the failure.
        warning = `Could not read the transaction list: ${String(err)}`
      }
    }

    if (parsed.length === 0) {
      txnResult = {
        filed: 0, skipped_duplicates: 0, low_confidence: lowConfidence.length,
        unresolved_account: false, ai_categorised: 0, proposed_rules: [], warning,
      }
    } else if (!targetAccountId) {
      txnResult = {
        filed: 0, skipped_duplicates: 0, low_confidence: lowConfidence.length,
        unresolved_account: true, ai_categorised: 0, proposed_rules: [],
        warning: 'Found transactions but could not tell which account they belong to. Say which account and re-upload.',
      }
    } else {
      // A statement is authoritative for its own window, so keys come from the
      // batch alone. Re-importing regenerates the same keys, so a row already
      // stored is recognisable by its key.
      const keys = buildImportKeys(targetAccountId, parsed)

      const { data: existingKeys } = await supabase
        .from('money_transactions')
        .select('dedupe_key')
        .eq('account_id', targetAccountId)
      const stored = new Set((existingKeys ?? []).map(r => r.dedupe_key as string))

      // Only rows not already stored are touched at all.
      //
      // Re-writing an existing row would overwrite whatever category it has
      // acquired since — including one the user set by hand. That was a real bug:
      // re-importing a statement turned a manual category back into an AI guess,
      // silently discarding the most reliable signal in the system. Skipping
      // stored rows also avoids paying for a categorisation call on transactions
      // that were categorised on a previous import.
      const fresh = parsed
        .map((pt, i) => ({ pt, key: keys[i] }))
        .filter(x => !stored.has(x.key))
      const alreadyThere = parsed.length - fresh.length

      let suggestions: CategorySuggestion[] = []
      let inserted: { id: string }[] = []
      let txnErr: { message: string } | null = null
      let aiApplied = 0
      let aiSkipped = 0

      if (fresh.length > 0) {
        const { data: rules } = await supabase.from('money_category_rules').select('*')
        const categorised = applyRules(
          fresh.map(x => ({
            ...x.pt,
            category_id: null as string | null,
            category_source: null as never,
            property_id: null as string | null,
          })),
          (rules ?? []) as MoneyCategoryRule[],
        )

        // Write the transactions FIRST, categorised by rules alone.
        //
        // Rules are instant and deterministic; the AI pass is neither. Doing the
        // model calls before the insert meant a large import that ran out of time
        // saved nothing at all — three years of history discarded because an
        // optional enrichment step was slow. The data lands first, always.
        const payload = fresh.map((x, i) => ({
          user_id: user.id,
          account_id: targetAccountId,
          txn_date: x.pt.txn_date,
          description: x.pt.description,
          amount: x.pt.amount,
          category_id: categorised[i].category_id,
          category_source: categorised[i].category_source,
          property_id: categorised[i].property_id ?? null,
          document_id: doc.id,
          external_id: x.pt.external_id,
          dedupe_key: x.key,
        }))

        const res = await supabase
          .from('money_transactions')
          .upsert(payload, { onConflict: 'user_id,dedupe_key' })
          .select('id, description, category_id')
        inserted = (res.data ?? []) as { id: string }[]
        txnErr = res.error

        // Now enrich, if there is time. Anything not reached stays uncategorised
        // and visible, and "Recategorise" or a later upload will pick it up.
        const storedRows = (res.data ?? []) as {
          id: string; description: string; category_id: string | null
        }[]
        const needsCategory = storedRows.filter(r => !r.category_id)

        if (!txnErr && needsCategory.length > 0) {
          if (Date.now() - startedAt > AI_BUDGET_MS) {
            aiSkipped = needsCategory.length
          } else {
            const { data: cats } = await supabase.from('money_categories').select('*')
            try {
              suggestions = await suggestCategories(
                needsCategory.map(r => r.description),
                (cats ?? []) as MoneyCategory[],
              )
            } catch {
              suggestions = []
            }

            const byDescription = new Map(suggestions.map(x => [x.description.toLowerCase(), x]))
            for (const row of needsCategory) {
              const hit = byDescription.get(row.description.trim().toLowerCase())
              if (!hit) continue
              if (Date.now() - startedAt > AI_BUDGET_MS + 15_000) {
                aiSkipped++
                continue
              }
              const { error: upErr } = await supabase
                .from('money_transactions')
                .update({ category_id: hit.category_id, category_source: 'ai' })
                .eq('id', row.id)
              if (!upErr) aiApplied++
            }
          }
        }
      }

      // Distinct proposals only, so the UI can offer "make this a rule" once per
      // merchant rather than once per transaction.
      const proposedRules = [...new Map(
        suggestions.map(x => [`${x.suggested_pattern.toLowerCase()}|${x.category_id}`, x]),
      ).values()]

      txnResult = {
        filed: txnErr ? 0 : inserted.length,
        skipped_duplicates: alreadyThere,
        low_confidence: lowConfidence.length,
        unresolved_account: false,
        ai_categorised: aiApplied,
        left_uncategorised: aiSkipped,
        proposed_rules: proposedRules,
        warning: txnErr
          ? txnErr.message
          : aiSkipped > 0
            ? `${aiSkipped} transaction(s) were filed but not categorised — this import was too ` +
              `large to finish that in one go. Nothing is lost: use Recategorise, or upload again ` +
              `and only the categorising will run.`
            : warning,
      }
    }
  }

  return NextResponse.json({
    document_id: doc.id,
    transactions: txnResult,
    applied: applied.length,
    pending,
    unmatched: resolved.filter(r => !r.account_id).map(r => r.account_name),
  })
}
