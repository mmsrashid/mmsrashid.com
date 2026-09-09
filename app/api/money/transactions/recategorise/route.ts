import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { applyRules } from '@/lib/money/categorise'
import type { MoneyCategoryRule, MoneyTransaction } from '@/lib/money/spending-types'

/**
 * Re-runs the rule set over stored transactions.
 *
 * Rules are deterministic, so this is safe to run repeatedly — which is the
 * point of storing rules rather than relying on a fresh AI judgement each time.
 * Manual categories are left alone by applyRules.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const onlyUncategorised = body.only_uncategorised === true

  const { data: rules } = await supabase.from('money_category_rules').select('*')

  // Paged. PostgREST caps a select at 1000 rows, and this route silently
  // stopped there: on 2,015 transactions it reported "examined: 1000" and left
  // the rest untouched, which reads as "the rules do not match" rather than
  // "half your ledger was never looked at".
  const PAGE = 1000
  const collected: MoneyTransaction[] = []
  for (let offset = 0; ; offset += PAGE) {
    const q = supabase.from('money_transactions').select('*')
    const { data, error } = await (onlyUncategorised ? q.is('category_id', null) : q)
      .order('txn_date', { ascending: false })
      .range(offset, offset + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    collected.push(...((data ?? []) as MoneyTransaction[]))
    if (!data || data.length < PAGE) break
  }

  const before = collected
  const after = applyRules(before, (rules ?? []) as MoneyCategoryRule[])

  let changed = 0
  for (let i = 0; i < after.length; i++) {
    // Compare the property tag too: adding a property rule for transactions
    // that are already categorised would otherwise change nothing at all.
    const sameCategory = after[i].category_id === before[i].category_id
    const sameProperty = (after[i].property_id ?? null) === (before[i].property_id ?? null)
    if (sameCategory && sameProperty) continue
    const { error } = await supabase
      .from('money_transactions')
      .update({
        category_id: after[i].category_id,
        category_source: after[i].category_source,
        property_id: after[i].property_id ?? null,
      })
      .eq('id', before[i].id)
    if (!error) changed++
  }

  return NextResponse.json({
    examined: before.length,
    changed,
    still_uncategorised: after.filter(t => !t.category_id).length,
  })
}
