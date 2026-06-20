'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const COLUMNS = [
  { id: 'idea', label: 'Idea' },
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
]

interface Card {
  id: string
  title: string
  description: string
  status: string
  position: number
  tags: string[]
  due_date: string | null
}

function KanbanCard({ card, onDelete }: { card: Card; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`bg-white border border-gray-200 rounded-lg p-3 cursor-grab select-none ${isDragging ? 'opacity-50 shadow-lg' : 'hover:border-gray-400'}`}
    >
      <p className="text-sm font-medium text-gray-900">{card.title}</p>
      {card.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{card.description}</p>}
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-1 flex-wrap">
          {card.tags.map((tag) => (
            <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{tag}</span>
          ))}
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(card.id)}
          className="text-gray-300 hover:text-red-400 text-xs ml-2"
        >
          ✕
        </button>
      </div>
      {card.due_date && (
        <p className="text-xs text-gray-400 mt-1">Due {new Date(card.due_date).toLocaleDateString('en-GB')}</p>
      )}
    </div>
  )
}

function AddCardForm({ colId, onAdd }: { colId: string; onAdd: (card: Card) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const { data } = await supabase
      .from('kanban_cards')
      .insert({ title: title.trim(), status: colId, position: 0 })
      .select()
      .single()
    if (data) { onAdd(data); setTitle(''); setOpen(false) }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-xs text-gray-400 hover:text-gray-700 mt-1">
      + Add card
    </button>
  )

  return (
    <form onSubmit={submit} className="mt-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Card title…"
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-900"
      />
      <div className="flex gap-2 mt-2">
        <button type="submit" className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-md">Add</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500">Cancel</button>
      </div>
    </form>
  )
}

export default function KanbanBoard({ initialCards }: { initialCards: Card[] }) {
  const [cards, setCards] = useState(initialCards)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  function cardsInCol(colId: string) {
    return cards.filter((c) => c.status === colId).sort((a, b) => a.position - b.position)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    const activeCard = cards.find((c) => c.id === active.id)
    if (!activeCard) return

    const overCard = cards.find((c) => c.id === over.id)
    const targetStatus = overCard ? overCard.status : (COLUMNS.find((c) => c.id === over.id)?.id ?? activeCard.status)

    if (activeCard.status !== targetStatus) {
      setCards((prev) => prev.map((c) => c.id === activeCard.id ? { ...c, status: targetStatus } : c))
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const activeCard = cards.find((c) => c.id === active.id)!
    const overCard = cards.find((c) => c.id === over.id)

    if (overCard && activeCard.id !== overCard.id && activeCard.status === overCard.status) {
      const colCards = cardsInCol(activeCard.status)
      const oldIdx = colCards.findIndex((c) => c.id === activeCard.id)
      const newIdx = colCards.findIndex((c) => c.id === overCard.id)
      const reordered = arrayMove(colCards, oldIdx, newIdx)

      setCards((prev) => {
        const others = prev.filter((c) => c.status !== activeCard.status)
        return [...others, ...reordered.map((c, i) => ({ ...c, position: i }))]
      })

      await Promise.all(reordered.map((c, i) =>
        supabase.from('kanban_cards').update({ position: i }).eq('id', c.id)
      ))
    } else {
      await supabase.from('kanban_cards').update({ status: activeCard.status }).eq('id', activeCard.id)
    }
  }

  async function deleteCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id))
    await supabase.from('kanban_cards').delete().eq('id', id)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 h-full overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colCards = cardsInCol(col.id)
          return (
            <div key={col.id} className="w-64 shrink-0 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{colCards.length}</span>
              </div>
              <SortableContext items={colCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <div className="flex-1 space-y-2 min-h-8">
                  {colCards.map((card) => (
                    <KanbanCard key={card.id} card={card} onDelete={deleteCard} />
                  ))}
                </div>
              </SortableContext>
              <AddCardForm colId={col.id} onAdd={(card) => setCards((prev) => [...prev, card])} />
            </div>
          )
        })}
      </div>
    </DndContext>
  )
}
