'use client'
import type { MoneyCategory } from '@/lib/money/spending-types'

type WithTreatment = MoneyCategory & { property_treatment?: string | null }

/**
 * Category dropdown, grouped.
 *
 * A flat list of 29 options buried "Rent received" at position 22, below every
 * general category — findable only by scrolling, so in practice not findable at
 * all. Grouping makes each section reachable by its label instead of its
 * position, and separates "Rent received" from the similarly-named
 * "Rent / Mortgage" you pay, which sit in opposite halves of a P&L.
 */
export default function CategoryPicker({
  categories,
  value,
  onChange,
  style,
  disabled,
}: {
  categories: WithTreatment[]
  value: string
  onChange: (id: string) => void
  style?: React.CSSProperties
  disabled?: boolean
}) {
  const property = categories.filter(c => c.property_treatment)
  const plain = categories.filter(c => !c.property_treatment)

  const groups: [string, WithTreatment[]][] = [
    ['Property', property],
    ['Spending', plain.filter(c => c.kind === 'spending')],
    ['Income', plain.filter(c => c.kind === 'income')],
    ['Transfers', plain.filter(c => c.kind === 'transfer')],
  ]

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      style={{
        border: '1px solid',
        borderColor: value ? '#d1d5db' : '#fbbf24',
        borderRadius: 6, padding: '3px 6px', fontSize: 11,
        ...style,
      }}
    >
      <option value="">— uncategorised —</option>
      {groups.map(([label, items]) => (
        items.length === 0 ? null : (
          <optgroup key={label} label={label}>
            {items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        )
      ))}
    </select>
  )
}
