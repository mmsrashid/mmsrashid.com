import { decideAppointmentLink, type AppointmentRef } from '@/lib/health/link-appointment'

const appt = (id: string, date: string, type: string): AppointmentRef => ({
  id, appointment_date: date, appointment_type: type, clinic_name: null,
})

const BLOODS = appt('b', '2025-10-13T09:00:00Z', 'Blood test')
const MRI = appt('m', '2025-10-13T14:00:00Z', 'Cardiac MRI')
const CARDIO = appt('c', '2025-11-20T10:00:00Z', 'Cardiology follow-up')

describe('decideAppointmentLink', () => {
  it('does nothing when the document has no date', () => {
    const r = decideAppointmentLink({ type: 'blood_result', date: null, name: 'x.pdf' }, [BLOODS])
    expect(r.autoLink).toBeNull()
    expect(r.suggestions).toEqual([])
  })

  it('links a blood report to a same-day blood test', () => {
    const r = decideAppointmentLink(
      { type: 'blood_result', date: '2025-10-13', name: 'Troponin.pdf' }, [BLOODS, CARDIO])
    expect(r.autoLink?.id).toBe('b')
  })

  it('links an MRI report to the MRI appointment, not the bloods on the same day', () => {
    // Both are on 13 Oct. Only the type hint separates them, and filing a
    // radiology report against a phlebotomy visit would be wrong.
    const r = decideAppointmentLink(
      { type: 'scan', date: '2025-10-13', name: 'MRI CARDIOVASCULAR.PDF' }, [BLOODS, MRI])
    expect(r.autoLink?.id).toBe('m')
  })

  it('links a report dated days after the only matching appointment', () => {
    const r = decideAppointmentLink(
      { type: 'scan', date: '2025-10-30', name: 'MRI report.pdf' }, [MRI, CARDIO])
    expect(r.autoLink?.id).toBe('m')
  })

  it('refuses to choose between two same-day appointments of the same kind', () => {
    const second = appt('b2', '2025-10-13T16:00:00Z', 'Blood test')
    const r = decideAppointmentLink(
      { type: 'blood_result', date: '2025-10-13', name: 'lab.pdf' }, [BLOODS, second])
    expect(r.autoLink).toBeNull()
    expect(r.suggestions.map(s => s.id).sort()).toEqual(['b', 'b2'])
  })

  it('does not link a document far from any appointment', () => {
    const r = decideAppointmentLink(
      { type: 'blood_result', date: '2026-05-01', name: 'lab.pdf' }, [BLOODS, MRI, CARDIO])
    expect(r.autoLink).toBeNull()
    expect(r.suggestions).toEqual([])
  })

  it('does not link a document dated long before an appointment', () => {
    // A report from a month before a visit is not evidence of that visit.
    const r = decideAppointmentLink(
      { type: 'blood_result', date: '2025-09-01', name: 'lab.pdf' }, [BLOODS])
    expect(r.autoLink).toBeNull()
  })

  it('tolerates a letter dated just before a follow-up', () => {
    const r = decideAppointmentLink(
      { type: 'letter', date: '2025-11-18', name: 'Clinic letter.pdf' }, [CARDIO])
    expect(r.suggestions.map(s => s.id)).toEqual(['c'])
  })

  it('ignores time of day when comparing dates', () => {
    // The appointment is at 14:00 UTC; a date-only document must still count as
    // the same calendar day rather than being pushed a day out.
    const r = decideAppointmentLink(
      { type: 'scan', date: '2025-10-13', name: 'scan.pdf' }, [MRI])
    expect(r.autoLink?.id).toBe('m')
  })
})
