import { NextRequest, NextResponse } from 'next/server'
import { deleteMessage } from '@/lib/email'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function DELETE(
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
    await deleteMessage(uidNum)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('IMAP delete error:', err)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
