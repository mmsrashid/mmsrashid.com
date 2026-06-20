'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import dynamic from 'next/dynamic'

const TiptapEditor = dynamic(() => import('@/components/TiptapEditor'), { ssr: false })

interface Post {
  id?: string
  title: string
  slug: string
  excerpt: string
  content_json: object
  published: boolean
}

export default function PostEditor({ initial }: { initial: Post }) {
  const [post, setPost] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  function slugify(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }

  function handleTitleChange(title: string) {
    setPost((p) => ({ ...p, title, slug: p.id ? p.slug : slugify(title) }))
  }

  async function save(publish?: boolean) {
    setSaving(true)
    setMsg('')
    const data = {
      ...post,
      published: publish !== undefined ? publish : post.published,
      published_at: publish ? new Date().toISOString() : null,
    }

    const { error } = post.id
      ? await supabase.from('posts').update(data).eq('id', post.id)
      : await supabase.from('posts').insert(data).select().single()

    setSaving(false)
    if (error) { setMsg('Error: ' + error.message); return }
    setMsg('Saved.')
    router.refresh()
    if (!post.id) router.push('/dashboard/blog')
  }

  async function deletePost() {
    if (!post.id || !confirm('Delete this post?')) return
    await supabase.from('posts').delete().eq('id', post.id)
    router.push('/dashboard/blog')
  }

  return (
    <div className="p-8 max-w-3xl overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{post.id ? 'Edit post' : 'New post'}</h1>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-gray-500">{msg}</span>}
          {post.id && (
            <button
              onClick={deletePost}
              className="text-sm text-red-500 hover:text-red-700 px-3 py-2"
            >
              Delete
            </button>
          )}
          <button
            onClick={() => save()}
            disabled={saving}
            className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            onClick={() => save(!post.published)}
            disabled={saving}
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            {post.published ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <input
            type="text"
            placeholder="Post title"
            value={post.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full text-2xl font-bold border-0 border-b border-gray-200 pb-2 focus:outline-none focus:border-gray-900 placeholder-gray-300"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Slug</label>
          <input
            type="text"
            value={post.slug}
            onChange={(e) => setPost((p) => ({ ...p, slug: e.target.value }))}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-900"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Excerpt</label>
          <textarea
            value={post.excerpt}
            onChange={(e) => setPost((p) => ({ ...p, excerpt: e.target.value }))}
            rows={2}
            placeholder="Short description for the post list…"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-900 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Content</label>
          <TiptapEditor
            content={post.content_json}
            onChange={(json) => setPost((p) => ({ ...p, content_json: json }))}
          />
        </div>
      </div>
    </div>
  )
}
