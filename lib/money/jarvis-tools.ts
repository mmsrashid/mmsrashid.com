import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildNetWorthSeries, latestNetWorth } from './net-worth'
import { buildAccountResolver } from './match-account'
import { buildSpendingSummary } from './spending-summary'
import { applyRules } from './categorise'
import type { MoneyAccount, MoneyBalance } from './types'
import type { MoneyCategory, MoneyCategoryRule, MoneyTransaction } from './spending-types'

export const MONEY_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_accounts',
    description: 'Financial accounts on record with kind, institution, currency and latest known balance.',
    input_schema: {
      type: 'object' as const,
      properties: { include_closed: { type: 'boolean', description: 'Default false.' } },
      required: [],
    },
  },
  {
    name: 'get_net_worth',
    description: 'Current net worth plus assets, debts and how it has changed over time.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_balance_history',
    description: 'Every recorded balance for one account, oldest first.',
    input_schema: {
      type: 'object' as const,
      properties: { account_name: { type: 'string' } },
      required: ['account_name'],
    },
  },
  {
    name: 'add_balance',
    description:
      'Record a balance for an account on a date. Names are matched loosely. If the name matches ' +
      'more than one account the tool returns the candidates instead of guessing — relay them and ask.',
    input_schema: {
      type: 'object' as const,
      properties: {
        account_name: { type: 'string' },
        balance: { type: 'number', description: 'As printed. For a debt, the amount owed as a positive number.' },
        as_of: { type: 'string', description: 'YYYY-MM-DD.' },
      },
      required: ['account_name', 'balance', 'as_of'],
    },
  },
  {
    name: 'get_spending_summary',
    description:
      'Spending for a month: total out, total in, net, and a category breakdown. Transfers between ' +
      "the user's own accounts are excluded from both totals. Always states how many transactions " +
      'are uncategorised, since the breakdown is incomplete without them.',
    input_schema: {
      type: 'object' as const,
      properties: { month: { type: 'string', description: 'YYYY-MM. Defaults to the current month.' } },
      required: [],
    },
  },
  {
    name: 'get_transactions',
    description: 'Transactions, filtered. Use for "what did I spend at X" or "show me last week".',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Match against the description.' },
        from: { type: 'string', description: 'YYYY-MM-DD inclusive.' },
        to: { type: 'string', description: 'YYYY-MM-DD inclusive.' },
        uncategorised_only: { type: 'boolean' },
        limit: { type: 'number', description: 'Default 50, max 200.' },
      },
      required: [],
    },
  },
  {
    name: 'add_category_rule',
    description:
      'Create a rule so descriptions containing a phrase get a category, then apply it to ' +
      'uncategorised transactions. Use when the user says what something should be categorised as.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: { type: 'string', description: 'Text to look for in the description.' },
        category_name: { type: 'string', description: 'Category to assign. Must already exist.' },
      },
      required: ['pattern', 'category_name'],
    },
  },
]

export const MONEY_TOOL_NAMES = new Set(MONEY_TOOLS.map(t => t.name))

const json = (v: unknown) => JSON.stringify(v, null, 2)

async function loadAll(supabase: SupabaseClient) {
  const [{ data: accounts }, { data: balances }] = await Promise.all([
    supabase.from('money_accounts').select('*'),
    supabase.from('money_balances').select('*').order('as_of', { ascending: true }),
  ])
  return {
    accounts: (accounts ?? []) as MoneyAccount[],
    balances: (balances ?? []) as MoneyBalance[],
  }
}

export async function executeMoneyTool(
  name: string,
  input: Record<string, unknown>,
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  if (name === 'get_accounts') {
    const { accounts, balances } = await loadAll(supabase)
    const list = input.include_closed ? accounts : accounts.filter(a => a.status === 'active')
    if (list.length === 0) return 'No accounts on record.'
    return json(list.map(a => {
      const rows = balances.filter(b => b.account_id === a.id)
      const latest = rows.length ? rows.reduce((x, y) => (x.as_of >= y.as_of ? x : y)) : null
      return {
        name: a.name, kind: a.kind, institution: a.institution, currency: a.currency,
        status: a.status,
        latest_balance: latest ? Number(latest.balance) : null,
        latest_balance_as_of: latest?.as_of ?? null,
      }
    }))
  }

  if (name === 'get_net_worth') {
    const { accounts, balances } = await loadAll(supabase)
    const series = buildNetWorthSeries(accounts, balances)
    if (series.currencyWarning) return series.currencyWarning
    const latest = latestNetWorth(series)
    if (!latest) return 'No balances recorded yet, so net worth cannot be calculated.'
    const first = series.points[0]
    return json({
      net_worth: latest.net,
      assets: latest.assets,
      debts: latest.liabilities,
      as_of: latest.date,
      accounts_counted: `${latest.accountsCounted} of ${latest.accountsTotal}`,
      earliest_point: { date: first.date, net: first.net },
      change_since_earliest: Math.round((latest.net - first.net) * 100) / 100,
      points: series.points.length,
    })
  }

  if (name === 'get_balance_history') {
    const { accounts, balances } = await loadAll(supabase)
    const match = buildAccountResolver(accounts)(String(input.account_name ?? ''))
    if (!match) {
      return `No single account matched "${input.account_name}". On record: ${accounts.map(a => a.name).join(', ')}`
    }
    const rows = balances.filter(b => b.account_id === match.id)
    if (rows.length === 0) return `${match.name} has no recorded balances.`
    return json({
      account: match.name,
      history: rows.map(b => ({ as_of: b.as_of, balance: Number(b.balance), source: b.source })),
    })
  }

  if (name === 'add_balance') {
    const { accounts } = await loadAll(supabase)
    const wanted = String(input.account_name ?? '')
    const match = buildAccountResolver(accounts)(wanted)
    if (!match) {
      return `No single account matched "${wanted}", so nothing was saved. On record: ${accounts.map(a => a.name).join(', ')}. Ask which one is meant.`
    }

    const balance = Number(input.balance)
    if (!Number.isFinite(balance)) return 'The balance was not a number, so nothing was saved.'

    const asOf = String(input.as_of ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return 'as_of must be YYYY-MM-DD. Nothing was saved.'
    if (asOf > new Date().toISOString().slice(0, 10)) {
      return 'That date is in the future, so nothing was saved.'
    }

    const { error } = await supabase.from('money_balances').upsert({
      user_id: userId,
      account_id: match.id,
      as_of: asOf,
      balance: Math.round(balance * 100) / 100,
      source: 'manual',
    }, { onConflict: 'user_id,account_id,as_of' })

    if (error) return `Could not save: ${error.message}`
    return `Recorded ${balance} for ${match.name} as of ${asOf}.`
  }

  if (name === 'get_spending_summary') {
    const month = String(input.month ?? new Date().toISOString().slice(0, 7))
    const [{ data: txns }, { data: cats }, { data: accts }] = await Promise.all([
      supabase.from('money_transactions').select('*'),
      supabase.from('money_categories').select('*'),
      supabase.from('money_accounts').select('*'),
    ])
    const summary = buildSpendingSummary(
      (txns ?? []) as MoneyTransaction[],
      (cats ?? []) as MoneyCategory[],
      (accts ?? []) as MoneyAccount[],
      month,
    )
    if (summary.currencyWarning) return summary.currencyWarning
    if (summary.transactionCount === 0) return `No transactions recorded for ${month}.`
    return json({
      month: summary.month,
      total_out: summary.totalOut,
      total_in: summary.totalIn,
      net: summary.net,
      by_category: summary.byCategory.map(c => ({
        category: c.name, total: c.total, share_percent: Math.round(c.share * 100),
      })),
      // Always reported, so an incomplete breakdown cannot be presented as complete.
      uncategorised_count: summary.uncategorisedCount,
      uncategorised_value: summary.uncategorisedValue,
      transactions: summary.transactionCount,
      note: 'Transfers between own accounts are excluded from both totals.',
    })
  }

  if (name === 'get_transactions') {
    const limit = Math.min(Number(input.limit) || 50, 200)
    let q = supabase.from('money_transactions').select('*').order('txn_date', { ascending: false })
    if (input.from) q = q.gte('txn_date', String(input.from).slice(0, 10))
    if (input.to) q = q.lte('txn_date', String(input.to).slice(0, 10))
    if (input.uncategorised_only === true) q = q.is('category_id', null)

    const { data } = await q
    let rows = (data ?? []) as MoneyTransaction[]
    const search = String(input.search ?? '').toLowerCase()
    if (search) rows = rows.filter(t => t.description.toLowerCase().includes(search))
    if (rows.length === 0) return 'No transactions matched.'

    const { data: cats } = await supabase.from('money_categories').select('id, name')
    const catName = new Map((cats ?? []).map(c => [c.id as string, c.name as string]))

    return json({
      matched: rows.length,
      showing: Math.min(rows.length, limit),
      total: Math.round(rows.reduce((a, t) => a + Number(t.amount), 0) * 100) / 100,
      transactions: rows.slice(0, limit).map(t => ({
        date: t.txn_date, description: t.description, amount: Number(t.amount),
        category: t.category_id ? catName.get(t.category_id) ?? 'Unknown' : 'Uncategorised',
      })),
    })
  }

  if (name === 'add_category_rule') {
    const pattern = String(input.pattern ?? '').trim()
    const wanted = String(input.category_name ?? '').trim().toLowerCase()
    if (!pattern) return 'A pattern is required.'

    const { data: cats } = await supabase.from('money_categories').select('id, name')
    const matches = (cats ?? []).filter(c => (c.name as string).toLowerCase().includes(wanted))
    if (matches.length === 0) {
      return `No category matched "${input.category_name}". On record: ${(cats ?? []).map(c => c.name).join(', ')}`
    }
    if (matches.length > 1) {
      return `"${input.category_name}" matches ${matches.map(c => c.name).join(', ')}. Ask which one.`
    }

    const { error } = await supabase.from('money_category_rules').insert({
      user_id: userId, pattern, match_type: 'contains', category_id: matches[0].id, priority: 100,
    })
    if (error) return `Could not save the rule: ${error.message}`

    // Apply it immediately; rules are deterministic so this is safe to repeat.
    const [{ data: rules }, { data: txns }] = await Promise.all([
      supabase.from('money_category_rules').select('*'),
      supabase.from('money_transactions').select('*').is('category_id', null),
    ])
    const before = (txns ?? []) as MoneyTransaction[]
    const after = applyRules(before, (rules ?? []) as MoneyCategoryRule[])
    let changed = 0
    for (let i = 0; i < after.length; i++) {
      if (after[i].category_id === before[i].category_id) continue
      const { error: upErr } = await supabase
        .from('money_transactions')
        .update({ category_id: after[i].category_id, category_source: after[i].category_source })
        .eq('id', before[i].id)
      if (!upErr) changed++
    }

    return `Rule saved: descriptions containing "${pattern}" are now ${matches[0].name}. ${changed} transaction(s) recategorised.`
  }

  return `Unknown money tool: ${name}`
}
