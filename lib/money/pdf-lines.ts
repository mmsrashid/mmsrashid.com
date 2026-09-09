import type { PdfLine } from './parse-barclays-pdf'

/**
 * Turns a PDF into positioned lines of text.
 *
 * Kept apart from the parser so the parser stays a pure function over data and
 * can be tested without a PDF at all. This half is the only part that needs a
 * PDF library, and it does nothing but group text items into lines.
 */
export async function pdfToLines(bytes: Uint8Array): Promise<PdfLine[]> {
  // Imported lazily: the PDF library is large, and a CSV import should not pay
  // for it.
  const { getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(bytes)

  const lines: PdfLine[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()

    // Group by baseline. Items on one visual row can differ by a point or two,
    // so an exact match on y would split a row in half.
    const rows = new Map<number, { text: string; x: number; width: number }[]>()
    for (const item of content.items as
      { str?: string; transform?: number[]; width?: number }[]) {
      const text = item.str
      if (!text || !text.trim()) continue
      const transform = item.transform
      if (!transform) continue
      const y = Math.round(transform[5])
      const x = Math.round(transform[4])
      // Width is what makes the right-aligned money columns readable at all.
      const width = Math.round(item.width ?? 0)

      const key = [...rows.keys()].find(k => Math.abs(k - y) <= 2) ?? y
      const bucket = rows.get(key) ?? []
      bucket.push({ text, x, width })
      rows.set(key, bucket)
    }

    for (const [y, tokens] of rows) {
      lines.push({ page: p, y, tokens: tokens.sort((a, b) => a.x - b.x) })
    }
  }

  return lines
}
