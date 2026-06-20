import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import KanbanBoard from './KanbanBoard'

export default async function KanbanPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: cards } = await supabase
    .from('kanban_cards')
    .select('*')
    .order('position')

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Kanban</h1>
        <p className="text-sm text-gray-500 mt-1">Drag cards between columns to track progress.</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <KanbanBoard initialCards={cards ?? []} />
      </div>
    </div>
  )
}
