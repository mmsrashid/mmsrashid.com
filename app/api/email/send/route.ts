import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { to, subject, text, html, inReplyTo, references } = body

  if (!to || !subject || !text) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    await sendEmail({ to, subject, text, html, inReplyTo, references })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('SMTP send error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
