export const CATEGORY_KINDS = ['spending', 'income', 'transfer'] as const
export type CategoryKind = (typeof CATEGORY_KINDS)[number]

export const MATCH_TYPES = ['contains', 'exact', 'regex'] as const
export type MatchType = (typeof MATCH_TYPES)[number]

export const CATEGORY_SOURCES = ['rule', 'ai', 'manual'] as const
export type CategorySource = (typeof CATEGORY_SOURCES)[number]

export interface MoneyCategory {
  id: string
  user_id: string
  name: string
  kind: CategoryKind
  sort_order: number
  created_at: string
}

export interface MoneyTransaction {
  id: string
  user_id: string
  account_id: string
  txn_date: string
  description: string
  merchant: string | null
  /** Negative is money out, positive is money in. */
  amount: number
  category_id: string | null
  category_source: CategorySource | null
  document_id: string | null
  external_id: string | null
  dedupe_key: string
  notes: string | null
  created_at: string
}

export interface MoneyCategoryRule {
  id: string
  user_id: string
  match_type: MatchType
  pattern: string
  category_id: string
  priority: number
  created_at: string
}

/** A row from a parser or extractor, before it becomes a transaction. */
export interface ParsedTransaction {
  txn_date: string
  description: string
  amount: number
  external_id: string | null
}

/**
 * Starter categories. UK-typical, all editable — seeded on first use rather than
 * in SQL so the list lives with the code that depends on it.
 */
export const DEFAULT_CATEGORIES: { name: string; kind: CategoryKind }[] = [
  { name: 'Groceries', kind: 'spending' },
  { name: 'Eating out', kind: 'spending' },
  { name: 'Transport', kind: 'spending' },
  { name: 'Fuel', kind: 'spending' },
  { name: 'Utilities', kind: 'spending' },
  { name: 'Rent / Mortgage', kind: 'spending' },
  { name: 'Health', kind: 'spending' },
  { name: 'Pharmacy', kind: 'spending' },
  { name: 'Insurance', kind: 'spending' },
  { name: 'Subscriptions', kind: 'spending' },
  { name: 'Shopping', kind: 'spending' },
  { name: 'Home', kind: 'spending' },
  { name: 'Travel', kind: 'spending' },
  { name: 'Fees & charges', kind: 'spending' },
  { name: 'Cash', kind: 'spending' },
  { name: 'Other', kind: 'spending' },
  { name: 'Salary', kind: 'income' },
  { name: 'Interest', kind: 'income' },
  { name: 'Refunds', kind: 'income' },
  { name: 'Other income', kind: 'income' },
  { name: 'Transfer', kind: 'transfer' },
]
