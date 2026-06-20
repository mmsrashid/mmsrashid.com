import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import PostEditor from '../PostEditor'

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: post } = await supabase.from('posts').select('*').eq('id', id).single()
  if (!post) notFound()

  return <PostEditor initial={post} />
}
