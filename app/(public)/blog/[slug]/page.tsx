import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { generateHTML } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'

export const revalidate = 60

type Props = { params: Promise<{ slug: string }> }

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: post } = await supabase
    .from('posts')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!post) notFound()

  const html = generateHTML(post.content_json, [StarterKit])

  const date = post.published_at
    ? new Date(post.published_at).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <time className="text-sm text-gray-400 mb-4 block">{date}</time>
      <h1 className="text-4xl font-bold text-gray-900 mb-12">{post.title}</h1>
      <div
        className="prose prose-gray max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
