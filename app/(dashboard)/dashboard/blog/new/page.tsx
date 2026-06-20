import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PostEditor from '../PostEditor'

export default async function NewPostPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <PostEditor
      initial={{ title: '', slug: '', excerpt: '', content_json: {}, published: false }}
    />
  )
}
