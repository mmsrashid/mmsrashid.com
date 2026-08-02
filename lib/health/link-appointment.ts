import type { DocumentType } from './types'

export interface AppointmentRef {
  id: string
  appointment_date: string
  appointment_type: string
  clinic_name: string | null
}

export interface LinkCandidate {
  appointment: AppointmentRef
  /** Days between the document's date and the appointment. Negative = before. */
  dayGap: number
  typeMatch: boolean
}

export interface LinkDecision {
  /** Set only when the match is unambiguous enough to apply without asking. */
  autoLink: AppointmentRef | null
  /** Plausible alternatives to offer the user; empty when there are none. */
  suggestions: AppointmentRef[]
  reason: string
}

/** Words in an appointment type that indicate what kind of document it produces. */
const TYPE_HINTS: Record<string, RegExp> = {
  blood_result: /\b(blood|phlebotomy|bloods|lab|pathology|haemat|biochem)\b/i,
  scan: /\b(mri|ct|scan|imaging|ultrasound|echo|echocardiogram|x-?ray|angiogram|radiolog)\b/i,
  prescription: /\b(pharmacy|prescription|medication review|medicines)\b/i,
}

const DAY = 86_400_000

/** Calendar days between two ISO dates, ignoring time of day. */
function dayGap(docDate: string, apptDate: string): number {
  const d = new Date(`${docDate.slice(0, 10)}T00:00:00Z`).getTime()
  const a = new Date(`${apptDate.slice(0, 10)}T00:00:00Z`).getTime()
  return Math.round((d - a) / DAY)
}

/**
 * Decides which appointment a document belongs to.
 *
 * Deliberately conservative. A blood report filed against the wrong clinic visit
 * is worse than one left unfiled: the document library still holds it, but the
 * appointment now tells a story that did not happen. So a link is only applied
 * automatically when exactly one appointment is a credible match; anything else
 * is returned as a suggestion for the user to confirm.
 *
 * Timing assumption: a result is dated on or after its appointment (you are
 * bled, then the lab reports). A small negative gap is tolerated for letters
 * dated slightly before a follow-up visit, but a document long before an
 * appointment is not evidence of that appointment.
 */
export function decideAppointmentLink(
  doc: { type: DocumentType; date: string | null; name: string },
  appointments: AppointmentRef[],
): LinkDecision {
  if (!doc.date) {
    return { autoLink: null, suggestions: [], reason: 'The document has no date, so it cannot be placed against a visit.' }
  }

  // The document's own name can identify it better than its stored type: this
  // library had three cardiac MRI reports auto-classified as "other" and
  // "letter" on upload. The name is used only to pick which hint applies to the
  // document — never as evidence about a particular appointment, or every
  // appointment would match whenever the filename was descriptive.
  const named = Object.entries(TYPE_HINTS).find(([, re]) => re.test(doc.name))?.[0]
  const effectiveType = named ?? doc.type
  const hint = TYPE_HINTS[effectiveType]

  const candidates: LinkCandidate[] = appointments
    .map(a => ({
      appointment: a,
      dayGap: dayGap(doc.date!, a.appointment_date),
      typeMatch: hint ? hint.test(a.appointment_type) : false,
    }))
    // A result belongs to a visit at or shortly after it; 30 days covers a slow
    // radiology report, and 3 days back covers a letter written just before.
    .filter(c => c.dayGap >= -3 && c.dayGap <= 30)

  if (candidates.length === 0) {
    return { autoLink: null, suggestions: [], reason: 'No appointment falls near that document’s date.' }
  }

  const sortByCloseness = (a: LinkCandidate, b: LinkCandidate) =>
    Math.abs(a.dayGap) - Math.abs(b.dayGap)

  // Appointments whose type agrees with the document win outright: on a day
  // holding both a blood test and an MRI, the radiology report belongs to the
  // MRI and filing it against phlebotomy would invent a history.
  const typed = candidates.filter(c => c.typeMatch)
  const pool = typed.length ? typed : candidates
  const sameDay = pool.filter(c => c.dayGap === 0)
  const shortlist = sameDay.length ? sameDay : pool

  if (shortlist.length === 1) {
    const only = shortlist[0]
    // Confident enough to apply only when the kind of document matches the
    // appointment, or it lands on the exact day. A generic letter two days
    // before a visit could equally be a referral to it, so that only suggests.
    if (only.typeMatch || only.dayGap === 0) {
      return {
        autoLink: only.appointment,
        suggestions: [],
        reason: only.dayGap === 0
          ? `Same day as "${only.appointment.appointment_type}".`
          : `Only "${only.appointment.appointment_type}" matches this kind of document, ${only.dayGap} day(s) earlier.`,
      }
    }
    return {
      autoLink: null,
      suggestions: [only.appointment],
      reason: `Possibly "${only.appointment.appointment_type}", but nothing confirms it.`,
    }
  }

  const ranked = [...shortlist].sort(sortByCloseness)
  return {
    autoLink: null,
    suggestions: ranked.slice(0, 4).map(c => c.appointment),
    reason: 'More than one appointment could be the right one.',
  }
}
