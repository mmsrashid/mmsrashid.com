import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ count: postCount }, { count: msgCount }] = await Promise.all([
    supabase.from('posts').select('*', { count: 'exact', head: true }),
    supabase.from('visitor_messages').select('*', { count: 'exact', head: true }).eq('read', false),
  ])

  const cards = [
    { label: 'Blog Posts', value: postCount ?? 0, href: '/dashboard/blog', sub: 'Manage posts' },
    { label: 'Unread Messages', value: msgCount ?? 0, href: '/dashboard/email', sub: 'Visitor enquiries' },
    { label: 'Kanban', value: '—', href: '/dashboard/kanban', sub: 'Task board' },
    { label: 'Calendar', value: '—', href: '/dashboard/calendar', sub: 'Coming soon' },
  ]

  return (
    <div className="p-8 overflow-y-auto h-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back, Mohammed.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-2xl">
        {cards.map((c) => (
          <a
            key={c.label}
            href={c.href}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-400 transition-colors"
          >
            <p className="text-3xl font-bold text-gray-900">{c.value}</p>
            <p className="text-sm font-medium text-gray-700 mt-1">{c.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
          </a>
        ))}
      </div>
    </div>
  )
}
