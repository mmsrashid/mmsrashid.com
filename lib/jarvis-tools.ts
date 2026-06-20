import type Anthropic from '@anthropic-ai/sdk'
import { listMessages } from '@/lib/email'
import { getCalendarEvents } from '@/lib/google-calendar'

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_emails',
    description: 'Fetch recent emails from the inbox. Use when asked about emails, messages, or what is in the inbox.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Number of emails to fetch (default 10, max 30)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_calendar_events',
    description: 'Fetch upcoming calendar events from personal and work Google Calendars. Use when asked about schedule, meetings, or upcoming events.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days_ahead: {
          type: 'number',
          description: 'How many days ahead to look (default 7, max 30)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_current_time',
    description: 'Get the current date and time.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
]

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (name === 'get_current_time') {
    return new Date().toLocaleString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long',
      day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  if (name === 'get_emails') {
    const limit = Math.min(Number(input.limit) || 10, 30)
    const messages = await listMessages('INBOX', limit)
    const summary = messages.slice(0, limit).map(m => ({
      from: m.fromName,
      subject: m.subject,
      date: new Date(m.date).toLocaleDateString('en-GB'),
      preview: m.preview,
      seen: m.seen,
    }))
    return JSON.stringify(summary, null, 2)
  }

  if (name === 'get_calendar_events') {
    const daysAhead = Math.min(Number(input.days_ahead) || 7, 30)
    const now = new Date()
    const timeMin = now.toISOString()
    const timeMax = new Date(now.getTime() + daysAhead * 86400000).toISOString()
    const events = await getCalendarEvents(timeMin, timeMax)
    const summary = events.map(e => ({
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      account: e.account,
      location: e.location,
    }))
    return JSON.stringify(summary, null, 2)
  }

  return `Unknown tool: ${name}`
}
