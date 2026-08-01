import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { listMessages } from '@/lib/email'

// Senders that are health providers by definition — any mail from them qualifies.
const HEALTH_SENDERS = [
  'nhs.uk', 'nhs.net', 'medichecks', 'bupa', 'vitality', 'axahealth', 'axa-health',
  'thriva', 'randoxhealth', 'nuffieldhealth', 'spirehealthcare', 'practiceplus',
]

// Unambiguous health terms — a single hit is enough.
const STRONG_TERMS = [
  'nhs', 'hospital', 'doctor', 'clinic', 'prescription', 'referral', 'pharmacy',
  'consultant', 'physiotherapy', 'phlebotomy', 'pathology', 'radiology',
  'vaccination', 'immunisation', 'x-ray', 'mri', 'ultrasound', 'biopsy',
  // NB: "test results" is deliberately NOT here — CI and QA mail uses it
  // constantly. It still matches via "blood test" or a context term.
  'blood test', 'blood results', 'blood pressure',
  'gp surgery', 'gp appointment', 'medical record', 'discharge summary',
  'medichecks', 'bupa', 'axa health',
]

// Generic terms that appear constantly in ordinary mail. These only count when
// they co-occur with a medical context word — otherwise "test 2" or a haircut
// booking would land in the health inbox.
const WEAK_TERMS = ['test', 'results', 'appointment', 'surgery', 'scan', 'screening', 'blood']

// Deliberately shares no terms with WEAK_TERMS, so a weak term can never
// satisfy its own context requirement.
const CONTEXT_TERMS = [
  'nhs', 'gp', 'doctor', 'dr', 'clinic', 'hospital', 'medical', 'health',
  'patient', 'lab', 'laboratory', 'pathology', 'sample', 'prescription',
  'consultant', 'nurse', 'practice', 'referral', 'diagnosis', 'vaccine',
]

// Whole-word match so "latest" doesn't trip "test" and "gp" doesn't trip "gpu".
const hasWord = (haystack: string, term: string) =>
  new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(haystack)

function isHealthRelated(msg: { from?: string; subject?: string }): boolean {
  const from = (msg.from ?? '').toLowerCase()
  const subject = (msg.subject ?? '').toLowerCase()
  const haystack = `${from} ${subject}`

  if (HEALTH_SENDERS.some(d => from.includes(d))) return true
  if (STRONG_TERMS.some(t => hasWord(haystack, t))) return true

  const weakHit = WEAK_TERMS.some(t => hasWord(haystack, t))
  if (!weakHit) return false
  // Require independent medical context alongside the generic term.
  return CONTEXT_TERMS.some(t => hasWord(haystack, t))
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
