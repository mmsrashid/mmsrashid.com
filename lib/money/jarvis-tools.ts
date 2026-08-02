import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildNetWorthSeries, latestNetWorth } from './net-worth'
import { buildAccountResolver } from './match-account'
import type { MoneyAccount, MoneyBalance } from './types'

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

  return `Unknown money tool: ${name}`
}
