import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Returns a short-lived signed URL for viewing the original file. The bucket is
 * private, so the object can't be linked to directly.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS restricts this to the caller's own documents.
  const { data: doc, error } = await supabase
    .from('health_documents')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: signed, error: sErr } = await supabase.storage
    .from('health-documents')
    .createSignedUrl(doc.storage_path, 60 * 10)
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })

  const ext = doc.storage_path.split('.').pop()?.toLowerCase() ?? ''
  const kind = ext === 'pdf' ? 'pdf' : ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? 'image' : 'other'

  return NextResponse.json({ url: signed.signedUrl, kind, name: doc.name, document: doc })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: doc } = await supabase
    .from('health_documents')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Remove the row first: if the object delete fails we'd rather leave an
  // orphaned file than a record pointing at nothing.
  const { error } = await supabase.from('health_documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: sErr } = await supabase.storage.from('health-documents').remove([doc.storage_path])
  return NextResponse.json({ deleted: true, storage_warning: sErr?.message ?? null })
}
