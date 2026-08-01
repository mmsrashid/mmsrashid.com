import Anthropic from '@anthropic-ai/sdk'
import { DOCUMENT_TYPES, type ExtractionResult } from './types'

const client = new Anthropic()

export const SUPPORTED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

export type SupportedMime = (typeof SUPPORTED_MIME)[number]

export function isSupportedMime(m: string): m is SupportedMime {
  return (SUPPORTED_MIME as readonly string[]).includes(m)
}

const CONFIDENCE = {
  type: 'string' as const,
  enum: ['high', 'low'],
  description:
    'Use "high" only when the value is printed unambiguously and you did not infer or guess any part of it. Use "low" if the text is blurry, cropped, handwritten, ambiguous, or if you inferred the field from context.',
}

// A tool schema forces well-formed JSON, which is far more reliable than
// asking for raw JSON in prose and parsing whatever comes back.
const RECORD_TOOL = {
  name: 'record_health_data',
  description: 'Record every health record found in the supplied document or image.',
  input_schema: {
    type: 'object' as const,
    properties: {
      document_type: {
        type: 'string',
        enum: [...DOCUMENT_TYPES],
        description: 'Best single classification of the source document.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Up to 4 short labels, e.g. lab or hospital name, specialty.',
      },
      summary: {
        type: 'string',
        description: 'One sentence, max 20 words, describing what this document is.',
      },
      blood_results: {
        type: 'array',
        description: 'Numeric laboratory or biomarker measurements only. Never invent values.',
        items: {
          type: 'object',
          properties: {
            marker_name: { type: 'string', description: 'Marker name exactly as printed.' },
            value: { type: 'number' },
            unit: { type: ['string', 'null'] },
            test_date: { type: ['string', 'null'], description: 'YYYY-MM-DD, or null if absent.' },
            lab_name: { type: ['string', 'null'] },
            confidence: CONFIDENCE,
          },
          required: ['marker_name', 'value', 'unit', 'test_date', 'lab_name', 'confidence'],
        },
      },
      medicines: {
        type: 'array',
        description: 'Prescribed or listed medications.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            dose: { type: ['number', 'null'], description: 'Numeric amount only, no unit.' },
            dose_unit: { type: ['string', 'null'], description: 'e.g. mg, mcg, IU, ml.' },
            frequency: { type: ['string', 'null'], description: 'e.g. "Once daily".' },
            route: { type: ['string', 'null'], description: 'e.g. oral, topical, inhaled.' },
            start_date: { type: ['string', 'null'], description: 'YYYY-MM-DD or null.' },
            prescribing_doctor: { type: ['string', 'null'] },
            confidence: CONFIDENCE,
          },
          required: ['name', 'dose', 'dose_unit', 'frequency', 'route', 'start_date', 'prescribing_doctor', 'confidence'],
        },
      },
      appointments: {
        type: 'array',
        description: 'Scheduled or attended appointments.',
        items: {
          type: 'object',
          properties: {
            appointment_date: {
              type: ['string', 'null'],
              description: 'ISO 8601 date or date-time. Null if no date is stated.',
            },
            appointment_type: { type: 'string', description: 'e.g. "Cardiology follow-up".' },
            doctor_name: { type: ['string', 'null'] },
            clinic_name: { type: ['string', 'null'] },
            confidence: CONFIDENCE,
          },
          required: ['appointment_date', 'appointment_type', 'doctor_name', 'clinic_name', 'confidence'],
        },
      },
    },
    required: ['document_type', 'tags', 'summary', 'blood_results', 'medicines', 'appointments'],
  },
}

const PROMPT = `You are reading a personal health document — it may be a lab report, a letter from a clinician, a prescription, or a phone screenshot of any of those.

Extract every health record you can find and report it with the record_health_data tool.

Rules:
- Only report what is actually written. Never estimate, complete, or invent a value.
- Transcribe numbers exactly, including decimal points. A misplaced decimal is a serious error.
- If a value is blurry, cropped, handwritten, or ambiguous, still report it but mark confidence "low".
- If the document contains no records of a given kind, return an empty array for it.
- Reference ranges are not measurements. Only record the patient's own result.`

const EMPTY: ExtractionResult = {
  document_type: 'other',
  tags: [],
  summary: '',
  blood_results: [],
  medicines: [],
  appointments: [],
}

/**
 * Extract health records from a PDF or image.
 * Returns empty arrays rather than throwing when nothing usable is found.
 */
export async function extractHealthRecords(
  base64: string,
  mime: SupportedMime,
): Promise<ExtractionResult> {
  const source =
    mime === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mime, data: base64 } }

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    tools: [RECORD_TOOL],
    tool_choice: { type: 'tool', name: RECORD_TOOL.name },
    messages: [{ role: 'user', content: [source, { type: 'text', text: PROMPT }] }],
  })

  const block = response.content.find(b => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') return EMPTY

  const raw = block.input as Partial<ExtractionResult>
  return {
    document_type: raw.document_type ?? 'other',
    tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 4) : [],
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    blood_results: Array.isArray(raw.blood_results) ? raw.blood_results : [],
    medicines: Array.isArray(raw.medicines) ? raw.medicines : [],
    appointments: Array.isArray(raw.appointments) ? raw.appointments : [],
  }
}
