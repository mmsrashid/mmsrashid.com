import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { extractMarkersFromPdf } from '@/lib/health/pdf-extract'

export const maxDuration = 60
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  const storagePath = `${user.id}/${Date.now()}-${file.name}`
  const { error: uploadErr } = await supabase.storage
    .from('health-documents')
    .upload(storagePath, bytes, { contentType: 'application/pdf' })

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const markers = await extractMarkersFromPdf(base64)

  return NextResponse.json({ markers, storagePath, fileName: file.name, fileSize: file.size })
}
