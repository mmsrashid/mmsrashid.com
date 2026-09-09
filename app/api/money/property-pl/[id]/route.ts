import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { taxYearBounds } from '@/lib/money/property-pl'
import { buildPropertyDetail } from '@/lib/money/property-detail'
import type { MoneyProperty } from '@/lib/money/property-types'
import type { MoneyCategory, MoneyTransaction } from '@/lib/money/spending-types'
import type { MoneyAccount } from '@/lib/money/types'

/**
 * One property's P&L, with the transactions behind every figure.
 *
 * Server-side for the same reason the portfolio endpoint is: cash and taxable
 * profit differ under Section 24, and two implementations of that would
 * eventually disagree about the same property.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = new URL(req.url).searchParams
  const taxYear = p.get('tax_year')
  const from = p.get('from')
  const to = p.get('to')
  const period = taxYear
    ? taxYearBounds(taxYear)
    : (from && to ? { from, to } : taxYearBounds(String(new Date().getFullYear())))

  const { data: property } = await supabase
    .from('money_properties').select('*').eq('id', id).maybeSingle()
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only this property's rows, and paged: PostgREST caps at 1000 and a
  // truncated P&L would look self-consistent while understating the year.
  const PAGE = 1000
  const txns: MoneyTransaction[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('money_transactions')
      .select('*')
      .eq('property_id', id)
      .gte('txn_date', period.from)
      .lte('txn_date', period.to)
      .range(offset, offset + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    txns.push(...((data ?? []) as MoneyTransaction[]))
    if (!data || data.length < PAGE) break
  }

  const [{ data: categories }, { data: accounts }] = await Promise.all([
    supabase.from('money_categories').select('*'),
    supabase.from('money_accounts').select('*'),
  ])

  const detail = buildPropertyDetail(
    property as MoneyProperty,
    txns,
    (categories ?? []) as MoneyCategory[],
    (accounts ?? []) as MoneyAccount[],
    period,
  )

  return NextResponse.json({
    ...detail,
    disclaimer:
      'Arithmetic, not tax advice. Mortgage interest is excluded from taxable profit under ' +
      'Section 24 and shown as a 20% reducer instead. The reducer is capped at 20% of property ' +
      'profits, but the statutory test also caps it against adjusted total income, which this ' +
      'app cannot see — so it is an upper bound. Check before filing anything.',
  })
}
