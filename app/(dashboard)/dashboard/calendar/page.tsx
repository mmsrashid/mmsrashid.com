import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCalendarEvents } from '@/lib/google-calendar'
import CalendarView from './CalendarView'

export const dynamic = 'force-dynamic'

export default async function CalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString()

  let events: import('@/lib/google-calendar').CalendarEvent[] = []
  try {
    events = await getCalendarEvents(timeMin, timeMax)
  } catch (e) {
    console.error('Calendar fetch error:', e)
  }

  return (
    <div className="p-6 h-full flex flex-col overflow-hidden">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {events.length} events from personal &amp; work calendars
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <CalendarView
          events={events}
          initialYear={now.getFullYear()}
          initialMonth={now.getMonth()}
        />
      </div>
    </div>
  )
}
