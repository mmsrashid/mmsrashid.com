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

/**
 * Shows only the last four digits.
 *
 * Masked by default because these pages get screenshotted and shared — the
 * number is available on demand, but should not leak from a casual screen grab.
 */
export function maskAccountNumber(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\s+/g, '')
  if (!digits) return ''
  if (digits.length <= 4) return digits
  return `••••${digits.slice(-4)}`
}

/** Formats a UK sort code as 12-34-56 when it looks like six digits. */
export function formatSortCode(value: string | null | undefined): string {
  const raw = (value ?? '').replace(/[^0-9]/g, '')
  if (raw.length !== 6) return (value ?? '').trim()
  return `${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4, 6)}`
}

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
  /** Bank or provider name. */
  institution: string | null
  kind: AccountKind
  currency: string
  /**
   * Identifying details. Text, not numbers: a sort code or account number can
   * begin with a zero, and nothing is ever computed from them.
   */
  account_number?: string | null
  sort_code?: string | null
  iban?: string | null
  account_holder?: string | null
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
