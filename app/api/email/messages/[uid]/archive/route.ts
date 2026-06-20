import { NextRequest, NextResponse } from 'next/server'
import { archiveMessage } from '@/lib/email'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { uid } = await params
  const uidNum = parseInt(uid, 10)
  if (isNaN(uidNum)) return NextResponse.json({ error: 'Invalid UID' }, { status: 400 })

  try {
    await archiveMessage(uidNum)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('IMAP archive error:', err)
    return NextResponse.json({ error: 'Failed to archive' }, { status: 500 })
  }
}
