import { NextResponse } from 'next/server'
import { listMessages } from '@/lib/email'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const messages = await listMessages('INBOX', 50)
    return NextResponse.json({ messages })
  } catch (err) {
    console.error('IMAP list error:', err)
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
}
