import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, email, message } = body

  if (!name || !email || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.from('visitor_messages').insert({ name, email, message })

  if (error) {
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
  }

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'website@mmsrashid.com',
      to: process.env.RESEND_NOTIFY_TO!,
      subject: `New message from ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`,
    })
  }

  return NextResponse.json({ ok: true })
}
