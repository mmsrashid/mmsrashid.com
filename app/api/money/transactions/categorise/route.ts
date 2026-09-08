import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { applyRules } from '@/lib/money/categorise'
import { suggestCategories } from '@/lib/money/suggest-categories'
import type { MoneyCategory, MoneyCategoryRule, MoneyTransaction } from '@/lib/money/spending-types'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Categorises transactions that have no category: rules first, then the model
 * for whatever they miss.
 *
 * Separate from the import so categorisation can be re-run at any time — after
 * adding rules, after an import ran out of time, or to recover from a mistake.
 * The import deliberately skips rows it has already stored, so re-uploading a
 * file will not categorise anything; this is the way to do it.
 *
 * Resumable by design: it works on a bounded slice and reports how many remain,
 * so a large backlog is cleared by calling it again rather than by one request
 * that has to survive long enough to finish everything.
 */
const SLICE = 250

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const useModel = body.use_model !== false

  const [{ data: rules }, { data: categories }] = await Promise.all([
    supabase.from('money_category_rules').select('*'),
    supabase.from('money_categories').select('*'),
  ])

  const { data: pending, error } = await supabase
    .from('money_transactions')
    .select('*')
    .is('category_id', null)
    .order('txn_date', { ascending: false })
    .limit(SLICE)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (pending ?? []) as MoneyTransaction[]
  if (rows.length === 0) {
    return NextResponse.json({ examined: 0, by_rule: 0, by_model: 0, still_uncategorised: 0 })
  }

  // Rules first: instant, deterministic, and free.
  const ruled = applyRules(rows, (rules ?? []) as MoneyCategoryRule[])
  let byRule = 0

  for (let i = 0; i < ruled.length; i++) {
    if (!ruled[i].category_id) continue
    const { error: e } = await supabase
      .from('money_transactions')
      .update({ category_id: ruled[i].category_id, category_source: 'rule' })
      .eq('id', rows[i].id)
    if (!e) byRule++
  }

  let byModel = 0
  const stillBlank = ruled
    .map((r, i) => ({ r, id: rows[i].id }))
    .filter(x => !x.r.category_id)

  if (useModel && stillBlank.length > 0) {
    let suggestions: Awaited<ReturnType<typeof suggestCategories>> = []
    try {
      suggestions = await suggestCategories(
        stillBlank.map(x => x.r.description),
        (categories ?? []) as MoneyCategory[],
      )
    } catch {
      // A model failure leaves rows uncategorised, which is visible and
      // recoverable. It must not undo the rule pass above.
      suggestions = []
    }

    const byDescription = new Map(suggestions.map(s => [s.description.toLowerCase(), s]))
    for (const x of stillBlank) {
      const hit = byDescription.get(x.r.description.trim().toLowerCase())
      if (!hit) continue
      const { error: e } = await supabase
        .from('money_transactions')
        .update({ category_id: hit.category_id, category_source: 'ai' })
        .eq('id', x.id)
      if (!e) byModel++
    }
  }

  const { count: remaining } = await supabase
    .from('money_transactions')
    .select('id', { count: 'exact', head: true })
    .is('category_id', null)

  return NextResponse.json({
    examined: rows.length,
    by_rule: byRule,
    by_model: byModel,
    still_uncategorised: remaining ?? 0,
    more_to_do: (remaining ?? 0) > 0,
  })
}
