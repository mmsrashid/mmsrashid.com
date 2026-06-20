import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function CalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Calendar</h1>
      <p className="text-sm text-gray-500">Google Calendar + Outlook sync — coming soon.</p>
    </div>
  )
}
