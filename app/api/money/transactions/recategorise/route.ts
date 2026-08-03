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

  const [{ data: rules }, { data: txns }] = await Promise.all([
    supabase.from('money_category_rules').select('*'),
    (onlyUncategorised
      ? supabase.from('money_transactions').select('*').is('category_id', null)
      : supabase.from('money_transactions').select('*')),
  ])

  const before = (txns ?? []) as MoneyTransaction[]
  const after = applyRules(before, (rules ?? []) as MoneyCategoryRule[])

  let changed = 0
  for (let i = 0; i < after.length; i++) {
    if (after[i].category_id === before[i].category_id) continue
    const { error } = await supabase
      .from('money_transactions')
      .update({ category_id: after[i].category_id, category_source: after[i].category_source })
      .eq('id', before[i].id)
    if (!error) changed++
  }

  return NextResponse.json({
    examined: before.length,
    changed,
    still_uncategorised: after.filter(t => !t.category_id).length,
  })
}
