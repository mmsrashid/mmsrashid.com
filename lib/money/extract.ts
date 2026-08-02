import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedBalance } from './types'

const client = new Anthropic()

/**
 * A tool schema, not prose parsing: the model is forced to emit valid JSON of
 * the right shape, so there is no regex over free text that silently changes
 * behaviour when the wording shifts.
 */
const TOOL: Anthropic.Tool = {
  name: 'record_balances',
  description: 'Record every account balance visible in the document.',
  input_schema: {
    type: 'object' as const,
    properties: {
      balances: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            account_name: { type: 'string', description: 'Account name or number as printed.' },
            balance: {
              type: 'number',
              description: 'The balance as printed. For a debt, the amount owed as a positive number.',
            },
            as_of: { type: ['string', 'null'], description: 'YYYY-MM-DD if a date is shown, else null.' },
            currency: { type: ['string', 'null'], description: 'ISO code, e.g. GBP, if shown.' },
            confidence: {
              type: 'string',
              enum: ['high', 'low'],
              description: "'low' if the figure, the account or the date is unclear or inferred.",
            },
          },
          required: ['account_name', 'balance', 'as_of', 'currency', 'confidence'],
        },
      },
    },
    required: ['balances'],
  },
}

const SYSTEM = `You read financial documents — bank statements, banking app screenshots, pension and mortgage statements — and extract account balances.

Rules:
- Record the balance as printed. For a debt (mortgage, loan, credit card), give the amount owed as a POSITIVE number; the application applies the sign.
- Prefer the closing or current balance over an opening balance or an available-credit figure.
- If a date is not shown, set as_of to null rather than guessing today.
- Mark confidence 'low' whenever the number, the account identity or the date is unclear, cropped or inferred. A wrong balance corrupts every later figure, so err toward 'low'.
- Do not invent accounts that are not visible.`

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
type ImageType = (typeof IMAGE_TYPES)[number]

export const isSupportedMoneyMime = (mime: string) =>
  mime === 'application/pdf' || (IMAGE_TYPES as readonly string[]).includes(mime)

export async function extractBalances(
  file: { data: string; mediaType: string },
): Promise<ExtractedBalance[]> {
  const isPdf = file.mediaType === 'application/pdf'

  const content: Anthropic.ContentBlockParam[] = [
    isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: (IMAGE_TYPES as readonly string[]).includes(file.mediaType)
              ? (file.mediaType as ImageType)
              : 'image/png',
            data: file.data,
          },
        },
    { type: 'text', text: 'Extract every account balance you can see.' },
  ]

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_balances' },
    messages: [{ role: 'user', content }],
  })

  const block = res.content.find(b => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') return []

  const raw = (block.input as { balances?: unknown[] }).balances ?? []
  return raw.flatMap((r): ExtractedBalance[] => {
    const row = r as Record<string, unknown>
    const balance = Number(row.balance)
    const name = String(row.account_name ?? '').trim()
    if (!name || !Number.isFinite(balance)) return []
    return [{
      account_name: name,
      balance: Math.round(balance * 100) / 100,
      as_of: row.as_of ? String(row.as_of).slice(0, 10) : null,
      currency: row.currency ? String(row.currency).toUpperCase() : null,
      confidence: row.confidence === 'high' ? 'high' : 'low',
      account_id: null,
    }]
  })
}
