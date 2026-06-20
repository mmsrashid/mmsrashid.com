// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */

const TOKEN_URI = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`)
  return data.access_token
}

export interface CalendarEvent {
  id: string
  title: string
  start: string // ISO
  end: string   // ISO
  allDay: boolean
  account: 'personal' | 'work'
  color: string
  location?: string
  description?: string
  htmlLink?: string
}

async function fetchEventsForAccount(
  accessToken: string,
  account: 'personal' | 'work',
  color: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })

  const res = await fetch(`${CALENDAR_API}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })

  if (!res.ok) {
    const err = await res.text()
    console.error(`Calendar API error (${account}):`, err)
    return []
  }

  const data = await res.json()
  console.log(`Calendar (${account}): ${data.items?.length ?? 0} events, nextPageToken=${data.nextPageToken ?? 'none'}`)
  return (data.items ?? []).map((item: any): CalendarEvent => {
    const allDay = Boolean(item.start?.date && !item.start?.dateTime)
    return {
      id: item.id,
      title: item.summary || '(no title)',
      start: item.start?.dateTime ?? item.start?.date ?? '',
      end: item.end?.dateTime ?? item.end?.date ?? '',
      allDay,
      account,
      color,
      location: item.location,
      description: item.description,
      htmlLink: item.htmlLink,
    }
  })
}

export async function getCalendarEvents(
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const personalToken = process.env.GOOGLE_REFRESH_TOKEN_PERSONAL
  const workToken = process.env.GOOGLE_REFRESH_TOKEN_WORK

  const results = await Promise.allSettled([
    personalToken
      ? getAccessToken(personalToken).then(t => fetchEventsForAccount(t, 'personal', '#4285F4', timeMin, timeMax))
      : Promise.resolve([]),
    workToken
      ? getAccessToken(workToken).then(t => fetchEventsForAccount(t, 'work', '#34A853', timeMin, timeMax))
      : Promise.resolve([]),
  ])

  const events: CalendarEvent[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') events.push(...r.value)
  }

  return events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
}
