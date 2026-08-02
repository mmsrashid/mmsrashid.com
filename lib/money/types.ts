export const ACCOUNT_KINDS = [
  'current', 'savings', 'isa', 'pension', 'investment',
  'credit_card', 'mortgage', 'loan', 'property', 'other',
] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

/**
 * The single source of truth for whether a balance counts against you.
 *
 * Derived from `kind` rather than stored on the row, so a bad write cannot make
 * a mortgage count as an asset.
 */
export const LIABILITY_KINDS: ReadonlySet<string> = new Set<AccountKind>([
  'credit_card', 'mortgage', 'loan',
])

export const isLiability = (kind: string) => LIABILITY_KINDS.has(kind)

export const ACCOUNT_STATUSES = ['active', 'closed'] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

export const BALANCE_SOURCES = ['manual', 'import', 'document', 'api'] as const
export type BalanceSource = (typeof BALANCE_SOURCES)[number]

export const MONEY_DOCUMENT_KINDS = ['statement', 'screenshot', 'csv', 'other'] as const
export type MoneyDocumentKind = (typeof MONEY_DOCUMENT_KINDS)[number]

/** Human labels for `kind`, for UI grouping and select options. */
export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  current: 'Current account',
  savings: 'Savings',
  isa: 'ISA',
  pension: 'Pension',
  investment: 'Investment',
  credit_card: 'Credit card',
  mortgage: 'Mortgage',
  loan: 'Loan',
  property: 'Property',
  other: 'Other',
}

export interface MoneyAccount {
  id: string
  user_id: string
  name: string
  institution: string | null
  kind: AccountKind
  currency: string
  opened_date: string | null
  closed_date: string | null
  status: AccountStatus
  notes: string | null
  created_at: string
}

export interface MoneyBalance {
  id: string
  user_id: string
  account_id: string
  as_of: string
  balance: number
  source: BalanceSource
  document_id: string | null
  notes: string | null
  created_at: string
}

export interface MoneyDocument {
  id: string
  user_id: string
  name: string
  kind: MoneyDocumentKind
  storage_path: string
  file_size_bytes: number | null
  extracted_balance_count: number
  created_at: string
}

/** 'low' means the model was unsure — the row is held for confirmation. */
export type Confidence = 'high' | 'low'

export interface ExtractedBalance {
  account_name: string
  balance: number
  as_of: string | null
  currency: string | null
  confidence: Confidence
  /** Resolved server-side against money_accounts; null when no match. */
  account_id: string | null
}
