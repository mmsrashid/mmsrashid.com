import Anthropic from '@anthropic-ai/sdk'
import type { ParsedTransaction } from './spending-types'

const client = new Anthropic()

const TOOL: Anthropic.Tool = {
  name: 'record_transactions',
  description: 'Record every transaction line visible in the statement.',
  input_schema: {
    type: 'object' as const,
    properties: {
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            txn_date: { type: 'string', description: 'YYYY-MM-DD.' },
            description: { type: 'string', description: 'The description exactly as printed.' },
            amount: {
              type: 'number',
              description: 'Magnitude only, always positive. Direction goes in `direction`.',
            },
            direction: {
              type: 'string',
              enum: ['out', 'in'],
              description: 'out = money left the account.',
            },
            external_id: { type: ['string', 'null'], description: "The bank's own reference, if printed." },
            confidence: { type: 'string', enum: ['high', 'low'] },
          },
          required: ['txn_date', 'description', 'amount', 'direction', 'external_id', 'confidence'],
        },
      },
      page_had_transactions: {
        type: 'boolean',
        description: 'False only if this document genuinely shows no transaction lines at all.',
      },
    },
    required: ['transactions', 'page_had_transactions'],
  },
}

const SYSTEM = `You read bank statements and extract every transaction line.

Rules:
- Give the amount as a POSITIVE magnitude and put the direction in \`direction\`. Never return a negative amount.
- Statements usually show a RUNNING BALANCE beside each row. That is not the transaction amount — never report it as one.
- Skip non-transaction lines: opening balance, closing balance, "balance carried forward", subtotals, page headers.
- Use the date printed against the row. If a row shows both a transaction date and a posting date, use the transaction date.
- Copy the description as printed; do not tidy or interpret it.
- Mark confidence 'low' if the amount, date or direction is unclear or cropped.
- Extract EVERY row you can see. A missed row silently loses spending history.`

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

export const isSupportedStatementMime = (mime: string) =>
  mime === 'application/pdf' || (IMAGE_TYPES as readonly string[]).includes(mime)

export interface ExtractionOutcome {
  rows: ParsedTransaction[]
  lowConfidence: ParsedTransaction[]
  /** Set when the model returned nothing but claimed the document has rows. */
  warning: string | null
}

export async function extractTransactions(
  file: { data: string; mediaType: string },
): Promise<ExtractionOutcome> {
  const isPdf = file.mediaType === 'application/pdf'

  const content: Anthropic.ContentBlockParam[] = [
    isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: (IMAGE_TYPES as readonly string[]).includes(file.mediaType)
              ? (file.mediaType as (typeof IMAGE_TYPES)[number])
              : 'image/png',
            data: file.data,
          },
        },
    { type: 'text', text: 'Extract every transaction line in this statement.' },
  ]

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    // A 20-page statement is easily 200+ rows; 2048 would truncate mid-list and
    // the loss would be invisible.
    max_tokens: 8192,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_transactions' },
    messages: [{ role: 'user', content }],
  })

  const block = res.content.find(b => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') {
    return { rows: [], lowConfidence: [], warning: 'The model returned no structured output.' }
  }

  const input = block.input as { transactions?: unknown[]; page_had_transactions?: boolean }
  const raw = input.transactions ?? []

  const rows: ParsedTransaction[] = []
  const lowConfidence: ParsedTransaction[] = []

  for (const r of raw) {
    const row = r as Record<string, unknown>
    const magnitude = Number(row.amount)
    const description = String(row.description ?? '').trim()
    const date = String(row.txn_date ?? '').slice(0, 10)
    if (!description || !Number.isFinite(magnitude) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (magnitude === 0) continue

    const parsed: ParsedTransaction = {
      txn_date: date,
      description,
      amount: row.direction === 'in' ? Math.abs(magnitude) : -Math.abs(magnitude),
      external_id: row.external_id ? String(row.external_id) : null,
    }
    if (row.confidence === 'high') rows.push(parsed)
    else lowConfidence.push(parsed)
  }

  // Distinguish "this document has no transactions" from "extraction failed".
  // Treating the second as the first is how a statement page goes missing
  // without anyone noticing.
  const warning = rows.length === 0 && lowConfidence.length === 0 && input.page_had_transactions
    ? 'The statement appears to contain transactions but none could be read. Try a clearer copy, or split it into fewer pages.'
    : null

  return { rows, lowConfidence, warning }
}
