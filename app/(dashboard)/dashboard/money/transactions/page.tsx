'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import CategoryPicker from '@/components/money/CategoryPicker'
import RulesManager from '@/components/money/RulesManager'
import {
  sortTransactions, nextSort, type Sort, type SortKey,
} from '@/lib/money/sort-transactions'
import type {
  MoneyCategory, MoneyCategoryRule, MoneyTransaction,
} from '@/lib/money/spending-types'
import type { MoneyProperty } from '@/lib/money/property-types'
import type { MoneyAccount } from '@/lib/money/types'

const money = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 })

export default function TransactionsPage() {
  const [txns, setTxns] = useState<MoneyTransaction[]>([])
  const [cats, setCats] = useState<MoneyCategory[]>([])
  const [accounts, setAccounts] = useState<MoneyAccount[]>([])
  const [properties, setProperties] = useState<MoneyProperty[]>([])
  const [rules, setRules] = useState<MoneyCategoryRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [categorising, setCategorising] = useState(false)

  const [sort, setSort] = useState<Sort>({ key: 'date', dir: 'desc' })

  const [search, setSearch] = useState('')
  const [onlyUncategorised, setOnlyUncategorised] = useState(false)
  const [accountFilter, setAccountFilter] = useState('')

  const load = useCallback(() => Promise.all([
    fetch('/api/money/transactions').then(r => r.json()),
    fetch('/api/money/categories').then(r => r.json()),
    fetch('/api/money/accounts').then(r => r.json()),
    fetch('/api/money/properties').then(r => r.json()).catch(() => []),
    fetch('/api/money/rules').then(r => r.json()).catch(() => []),
  ]).then(([t, c, a, p, r]) => {
    setTxns(Array.isArray(t) ? t : [])
    setCats(Array.isArray(c) ? c : [])
    setAccounts(Array.isArray(a) ? a : [])
    setProperties(Array.isArray(p) ? p : [])
    setRules(Array.isArray(r) ? r : [])
    setLoading(false)
  }), [])

  useEffect(() => { void load() }, [load])

  async function setCategory(t: MoneyTransaction, categoryId: string) {
    setError('')
    const res = await fetch(`/api/money/transactions/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: categoryId || null }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not update.')
    setTxns(prev => prev.map(x => (x.id === t.id ? d : x)))
  }

  async function setProperty(t: MoneyTransaction, propertyId: string) {
    setError('')
    const res = await fetch(`/api/money/transactions/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property_id: propertyId || null }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not update.')
    setTxns(prev => prev.map(x => (x.id === t.id ? d : x)))
  }

  /** Turns one correction into a rule, so the same merchant is right next time. */
  async function createRule(t: MoneyTransaction) {
    if (!t.category_id) return setError('Give it a category first, then create the rule.')

    // The property tag travels with the rule.
    //
    // This was the bug: the request carried only category_id, so tagging a
    // transaction to 4FLH and pressing Rule produced a rule that set the
    // category and silently forgot the property — every future rent payment
    // still needed tagging by hand, which is the whole thing the rule was for.
    const propertyId = (t as MoneyTransaction & { property_id?: string | null }).property_id ?? null
    const propertyCode = propertyId
      ? properties.find(p => p.id === propertyId)?.code ?? null
      : null

    const suggested = t.description.split(/\s{2,}|,/)[0].trim().slice(0, 40)
    const pattern = prompt(
      propertyCode
        ? `Any transaction containing this text will get that category and be assigned to ${propertyCode}:`
        : 'Any transaction whose description contains this text will get that category:',
      suggested,
    )
    if (!pattern) return

    const res = await fetch('/api/money/rules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pattern,
        match_type: 'contains',
        category_id: t.category_id,
        property_id: propertyId,
      }),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || 'Could not create the rule.')
    // Say so when this updated a rule instead of adding one, otherwise the
    // count in the Rules panel not going up looks like nothing happened.
    const verb = d.replaced_existing ? 'Rule updated' : 'Rule saved'

    // Full re-run, not just the uncategorised.
    //
    // A new rule usually exists because something was categorised WRONGLY — an
    // internal transfer read as spending, say. Limiting this to uncategorised
    // rows meant the rule appeared to do nothing on exactly the transactions it
    // was created to fix. Anything set by hand is still protected: applyRules
    // never overwrites a manual choice.
    const re = await fetch('/api/money/transactions/recategorise', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const rd = await re.json()
    setNotice(
      `${verb}${propertyCode ? ` (category and ${propertyCode})` : ''}. ` +
      `${rd.changed ?? 0} transaction(s) updated out of ${rd.examined ?? 0} checked; ` +
      `${rd.still_uncategorised ?? 0} still uncategorised. Anything you set by hand was left alone.`,
    )
    await load()
  }

  /**
   * Runs categorisation over uncategorised rows, in slices until done.
   *
   * Sliced rather than one long request: a few hundred rows needing the model
   * will not finish inside a single function invocation, and a run that dies
   * half way should still have saved what it did.
   */
  async function categoriseAll() {
    setError(''); setNotice('')
    setCategorising(true)
    let rule = 0, model = 0, rounds = 0
    try {
      for (;;) {
        const d = await fetch('/api/money/transactions/categorise', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        }).then(r => r.json())
        if (d.error) { setError(d.error); break }
        rule += d.by_rule ?? 0
        model += d.by_model ?? 0
        rounds++
        setNotice(
          `Categorising… ${rule + model} done, ${d.still_uncategorised ?? 0} to go.`,
        )
        if (!d.more_to_do || d.examined === 0) break
        // Nothing changed this round, so another identical round will not help.
        if ((d.by_rule ?? 0) + (d.by_model ?? 0) === 0) break
        if (rounds > 40) break
      }
      setNotice(`Categorised ${rule + model} transaction(s) — ${rule} by rule, ${model} by me.`)
      await load()
    } finally { setCategorising(false) }
  }

  const filtered = useMemo(() => txns.filter(t => {
    if (onlyUncategorised && t.category_id) return false
    if (accountFilter && t.account_id !== accountFilter) return false
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [txns, onlyUncategorised, accountFilter, search])

  const sorted = useMemo(
    () => sortTransactions(filtered, sort, { accounts, categories: cats, properties }),
    [filtered, sort, accounts, cats, properties],
  )

  const sortBy = (key: SortKey) => setSort(s => nextSort(s, key))

  if (loading) return <div style={{ padding: 40, fontSize: 12, color: '#9ca3af' }}>Loading…</div>
  if (txns.length === 0) return (
    <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: '#6b7280' }}>
      No transactions yet. Drop a statement into JARVIS.
    </div>
  )

  const input: React.CSSProperties = {
    border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', fontSize: 12,
  }
  const cell: React.CSSProperties = {
    padding: '8px 12px', borderBottom: '1px solid #f9fafb', fontSize: 12,
  }
  const nameOf = (id: string) => accounts.find(a => a.id === id)?.name ?? '—'

  const columns: [string, SortKey | null][] = [
    ['Date', 'date'],
    ['Description', 'description'],
    ['Account', 'account'],
    ['Amount', 'amount'],
    ['Category', 'category'],
    ...(properties.length ? [['Property', 'property'] as [string, SortKey]] : []),
    ['', null],
  ]

  return (
    <div style={{ padding: '20px 22px' }}>
      {error && <p style={{ fontSize: 12, color: '#991b1b', marginBottom: 8 }}>{error}</p>}
      {notice && <p style={{ fontSize: 12, color: '#065f46', marginBottom: 8 }}>{notice}</p>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={input} placeholder="Search description…" value={search}
          onChange={e => setSearch(e.target.value)} />
        <select style={input} value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label style={{ fontSize: 11, color: '#6b7280', display: 'flex', gap: 5, alignItems: 'center' }}>
          <input type="checkbox" checked={onlyUncategorised}
            onChange={e => setOnlyUncategorised(e.target.checked)} />
          uncategorised only
        </label>
        {txns.some(t => !t.category_id) && (
          <button onClick={categoriseAll} disabled={categorising}
            title="Apply rules, then let me categorise whatever is left"
            style={{ ...input, cursor: categorising ? 'wait' : 'pointer', background: '#111', color: '#fff', fontWeight: 600 }}>
            {categorising ? 'Categorising…' : `Categorise ${txns.filter(t => !t.category_id).length}`}
          </button>
        )}
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
          {filtered.length} of {txns.length}
        </span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {columns.map(([label, key]) => {
                const active = key !== null && sort.key === key
                return (
                  <th key={label} onClick={key ? () => sortBy(key) : undefined}
                    title={key ? `Sort by ${label.toLowerCase()}` : undefined}
                    style={{
                      textAlign: label === 'Amount' ? 'right' : 'left', padding: '8px 12px',
                      background: '#fafafa', fontWeight: 600, fontSize: 11,
                      borderBottom: '1px solid #f3f4f6',
                      color: active ? '#111' : '#9ca3af',
                      cursor: key ? 'pointer' : 'default',
                      userSelect: 'none', whiteSpace: 'nowrap',
                    }}>
                    {label}
                    {/* The arrow shows on the sorted column only, so the header
                        row says what the order actually is rather than leaving
                        it to be inferred from the rows. */}
                    {active && (
                      <span style={{ marginLeft: 4 }}>{sort.dir === 'asc' ? '\u25b2' : '\u25bc'}</span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 500).map(t => (
              <tr key={t.id}>
                <td style={cell}>{t.txn_date}</td>
                <td style={{
                  ...cell, maxWidth: 320, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {t.description}
                </td>
                <td style={{ ...cell, color: '#9ca3af' }}>{nameOf(t.account_id)}</td>
                <td style={{
                  ...cell, textAlign: 'right', fontWeight: 600,
                  color: Number(t.amount) < 0 ? '#111' : '#059669',
                }}>
                  {money(Number(t.amount))}
                </td>
                <td style={cell}>
                  <CategoryPicker
                    categories={cats}
                    value={t.category_id ?? ''}
                    onChange={id => setCategory(t, id)}
                  />
                  {t.category_source && (
                    <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 4 }}>
                      {t.category_source}
                    </span>
                  )}
                </td>
                {properties.length > 0 && (
                  <td style={cell}>
                    <select
                      value={(t as MoneyTransaction & { property_id?: string | null }).property_id ?? ''}
                      onChange={e => setProperty(t, e.target.value)}
                      style={{ ...input, padding: '3px 6px', fontSize: 11 }}
                    >
                      <option value="">—</option>
                      {properties.map(p => (
                        <option key={p.id} value={p.id}>{p.code}</option>
                      ))}
                    </select>
                  </td>
                )}
                <td style={cell}>
                  <button onClick={() => createRule(t)}
                    title="Apply this category to similar descriptions from now on"
                    style={{ ...input, padding: '3px 7px', fontSize: 10, cursor: 'pointer', background: '#fff' }}>
                    Rule
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RulesManager
        rules={rules}
        categories={cats}
        properties={properties}
        onChanged={load}
      />

      {filtered.length > 500 && (
        <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>
          Showing the first 500 of {filtered.length}, in the order you sorted them. Narrow the
          filters or sort the other way to see the rest — nothing has been deleted.
        </p>
      )}
    </div>
  )
}
