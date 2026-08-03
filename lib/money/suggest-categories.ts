import Anthropic from '@anthropic-ai/sdk'
import type { MoneyCategory } from './spending-types'

const client = new Anthropic()

export interface CategorySuggestion {
  description: string
  category_id: string
  /** A `contains` pattern that would match this and similar descriptions. */
  suggested_pattern: string
}

const TOOL: Anthropic.Tool = {
  name: 'assign_categories',
  description: 'Assign a category to each transaction description.',
  input_schema: {
    type: 'object' as const,
    properties: {
      assignments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'The description, copied exactly.' },
            category_name: { type: 'string', description: 'Must be one of the categories offered.' },
            suggested_pattern: {
              type: 'string',
              description:
                'The shortest distinctive fragment of the description that would identify this ' +
                'merchant in future, e.g. "TESCO" for "TESCO STORES 3421 REF 99". Omit reference ' +
                'numbers, dates and amounts.',
            },
            confidence: { type: 'string', enum: ['high', 'low'] },
          },
          required: ['description', 'category_name', 'suggested_pattern', 'confidence'],
        },
      },
    },
    required: ['assignments'],
  },
}

const SYSTEM = `You categorise UK bank transaction descriptions.

Rules:
- Use ONLY the category names offered. Never invent one.
- A transfer between the person's own accounts (descriptions mentioning transfer, their own name, or a savings/ISA pot) must get the transfer category, never a spending one.
- Money received (salary, interest, refunds) gets an income category.
- suggested_pattern must be a fragment that appears literally in the description, with reference numbers, dates and amounts removed, so it will match the same merchant next month.
- Mark confidence 'low' when the merchant is genuinely unclear. A wrong category is worse than an uncategorised one, because it silently distorts a total instead of being visibly missing.`

/**
 * Suggests categories for descriptions no rule matched.
 *
 * Batched into one call per chunk rather than one per transaction — a statement
 * can hold hundreds of rows, and per-row calls would be slow and expensive. Only
 * distinct descriptions are sent, since a merchant appearing twenty times needs
 * deciding once.
 *
 * Returns only high-confidence assignments. Low confidence is deliberately
 * dropped so the row stays visibly uncategorised.
 */
export async function suggestCategories(
  descriptions: string[],
  categories: MoneyCategory[],
): Promise<CategorySuggestion[]> {
  const distinct = [...new Set(descriptions.map(d => d.trim()).filter(Boolean))]
  if (distinct.length === 0 || categories.length === 0) return []

  const byName = new Map(categories.map(c => [c.name.toLowerCase(), c]))
  const offered = categories.map(c => `${c.name} (${c.kind})`).join('\n')

  // Chunked so a very long statement cannot exceed the output ceiling and get
  // truncated mid-list.
  const CHUNK = 80
  const out: CategorySuggestion[] = []

  for (let i = 0; i < distinct.length; i += CHUNK) {
    const batch = distinct.slice(i, i + CHUNK)

    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'assign_categories' },
      messages: [{
        role: 'user',
        content:
          `Available categories:\n${offered}\n\n` +
          `Descriptions:\n${batch.map(d => `- ${d}`).join('\n')}`,
      }],
    })

    const block = res.content.find(b => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') continue

    const rows = (block.input as { assignments?: unknown[] }).assignments ?? []
    for (const r of rows) {
      const row = r as Record<string, unknown>
      if (row.confidence !== 'high') continue

      const category = byName.get(String(row.category_name ?? '').toLowerCase())
      const description = String(row.description ?? '').trim()
      const pattern = String(row.suggested_pattern ?? '').trim()
      if (!category || !description || !pattern) continue

      // The pattern must actually occur in the description, or the rule it
      // becomes would never fire and the user would be left wondering why.
      if (!description.toLowerCase().includes(pattern.toLowerCase())) continue

      out.push({ description, category_id: category.id, suggested_pattern: pattern })
    }
  }

  return out
}
