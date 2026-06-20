'use client'

import { useState, useMemo } from 'react'
import type { CalendarEvent } from '@/lib/google-calendar'

interface Props {
  events: CalendarEvent[]
  initialYear: number
  initialMonth: number // 0-indexed
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function formatTime(iso: string, allDay: boolean) {
  if (allDay) return 'All day'
  const d = new Date(iso)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function CalendarView({ events, initialYear, initialMonth }: Props) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [view, setView] = useState<'month' | 'list'>('month')

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ]
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const eventsForDay = (day: Date) =>
    events.filter(e => {
      const start = new Date(e.start)
      return sameDay(start, day)
    })

  const selectedEvents = selectedDay ? eventsForDay(selectedDay) : []

  const upcomingEvents = useMemo(() => {
    const now = new Date()
    const end = new Date(now)
    end.setDate(end.getDate() + 30)
    return events.filter(e => {
      const s = new Date(e.start)
      return s >= now && s <= end
    })
  }, [events])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-1.5 rounded hover:bg-gray-100 text-gray-600">‹</button>
          <h2 className="text-lg font-semibold text-gray-900 w-44 text-center">
            {MONTHS[month]} {year}
          </h2>
          <button onClick={nextMonth} className="p-1.5 rounded hover:bg-gray-100 text-gray-600">›</button>
          <button
            onClick={() => { const n = new Date(); setYear(n.getFullYear()); setMonth(n.getMonth()) }}
            className="ml-2 px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50 text-gray-600"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#4285F4] inline-block"/>Personal</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#34A853] inline-block"/>Work</span>
          </div>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['month', 'list'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-xs capitalize ${view === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'month' ? (
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Grid */}
          <div className="flex-1">
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map(d => (
                <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden flex-1">
              {cells.map((day, i) => {
                if (!day) return <div key={i} className="bg-gray-50 h-24" />
                const dayEvents = eventsForDay(day)
                const today = sameDay(day, new Date())
                const selected = selectedDay && sameDay(day, selectedDay)
                return (
                  <div
                    key={i}
                    onClick={() => setSelectedDay(day)}
                    className={`bg-white h-24 p-1 cursor-pointer hover:bg-blue-50 transition-colors ${selected ? 'ring-2 ring-inset ring-blue-500' : ''}`}
                  >
                    <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-0.5
                      ${today ? 'bg-gray-900 text-white' : 'text-gray-700'}`}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-0.5 overflow-hidden">
                      {dayEvents.slice(0, 3).map(e => (
                        <div
                          key={e.id}
                          className="text-[10px] leading-tight px-1 py-0.5 rounded truncate text-white font-medium"
                          style={{ backgroundColor: e.color }}
                        >
                          {e.allDay ? e.title : `${formatTime(e.start, false)} ${e.title}`}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-gray-400 pl-1">+{dayEvents.length - 3} more</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Day detail panel */}
          <div className="w-72 shrink-0 border border-gray-200 rounded-lg p-3 overflow-y-auto">
            {selectedDay ? (
              <>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  {selectedDay.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                {selectedEvents.length === 0 ? (
                  <p className="text-xs text-gray-400">No events</p>
                ) : (
                  <div className="space-y-2">
                    {selectedEvents.map(e => <EventCard key={e.id} event={e} />)}
                  </div>
                )}
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Next 30 days</h3>
                {upcomingEvents.length === 0 ? (
                  <p className="text-xs text-gray-400">No upcoming events</p>
                ) : (
                  <div className="space-y-2">
                    {upcomingEvents.map(e => <EventCard key={e.id} event={e} showDate />)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        // List view
        <div className="flex-1 overflow-y-auto space-y-1">
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No upcoming events in the next 30 days</p>
          ) : (
            upcomingEvents.map(e => (
              <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200">
                <div className="w-1 self-stretch rounded-full shrink-0 mt-0.5" style={{ backgroundColor: e.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{e.title}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(e.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {!e.allDay && ` · ${formatTime(e.start, false)} – ${formatTime(e.end, false)}`}
                    {e.allDay && ' · All day'}
                  </p>
                  {e.location && <p className="text-xs text-gray-400 truncate">{e.location}</p>}
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full text-white shrink-0" style={{ backgroundColor: e.color }}>
                  {e.account}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function EventCard({ event, showDate }: { event: CalendarEvent; showDate?: boolean }) {
  return (
    <div className="rounded-lg p-2 text-xs" style={{ backgroundColor: event.color + '18', borderLeft: `3px solid ${event.color}` }}>
      <p className="font-semibold text-gray-900 leading-snug">{event.title}</p>
      {showDate && (
        <p className="text-gray-500 mt-0.5">
          {new Date(event.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
        </p>
      )}
      <p className="text-gray-500 mt-0.5">
        {event.allDay ? 'All day' : `${formatTime(event.start, false)} – ${formatTime(event.end, false)}`}
      </p>
      {event.location && <p className="text-gray-400 truncate mt-0.5">{event.location}</p>}
    </div>
  )
}
