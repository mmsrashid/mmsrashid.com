'use client'
import type { CategoryTotal } from '@/lib/money/spending-summary'

const money = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 })

const COLOURS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

/** Uncategorised is drawn in grey and never hidden — it distorts every other share. */
export default function SpendingByCategory({ rows }: { rows: CategoryTotal[] }) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 12, color: '#9ca3af' }}>Nothing spent in this month.</p>
  }

  return (
    <div>
      {rows.map((r, i) => (
        <div key={r.categoryId ?? 'uncategorised'} style={{ marginBottom: 9 }}>
          <div style={{ display: 'flex', fontSize: 12, marginBottom: 3 }}>
            <span style={{
              flex: 1,
              fontWeight: r.categoryId ? 500 : 700,
              color: r.categoryId ? '#111' : '#6b7280',
            }}>
              {r.name}
            </span>
            <span style={{ fontWeight: 600 }}>{money(r.total)}</span>
            <span style={{ width: 52, textAlign: 'right', color: '#9ca3af' }}>
              {Math.round(r.share * 100)}%
            </span>
          </div>
          <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.max(r.share * 100, 1)}%`,
              background: r.categoryId ? COLOURS[i % COLOURS.length] : '#9ca3af',
              borderRadius: 3,
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}
