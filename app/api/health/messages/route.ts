import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { listMessages } from '@/lib/email'

const HEALTH_KEYWORDS = [
  'nhs', 'hospital', 'gp ', 'doctor', 'clinic', 'prescription', 'referral',
  'blood', 'results', 'test', 'appointment', 'surgery', 'pharmacy',
  'medichecks', 'bupa', 'vitality', 'axa health',
]

function isHealthRelated(msg: { from?: string; subject?: string }): boolean {
  const haystack = `${msg.from ?? ''} ${msg.subject ?? ''}`.toLowerCase()
  return HEALTH_KEYWORDS.some(kw => haystack.includes(kw))
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const all = await listMessages('INBOX', 50)
    const health = all.filter(isHealthRelated)
    return NextResponse.json(health)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
