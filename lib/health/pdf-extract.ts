import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function extractMarkersFromPdf(pdfBase64: string): Promise<Array<{
  marker_name: string
  value: number
  unit: string
  test_date: string
  lab_name?: string
}>> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
        },
        {
          type: 'text',
          text: `Extract all blood test markers from this PDF. Return a JSON array with objects: { marker_name, value, unit, test_date (YYYY-MM-DD), lab_name? }. Only extract numeric lab values. Return only the JSON array, no other text.`,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  try {
    return JSON.parse(text)
  } catch {
    return []
  }
}
