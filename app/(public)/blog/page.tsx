import { createClient } from '@/lib/supabase/server'
import BlogCard from '@/components/BlogCard'
import type { Post } from '@/lib/types'

export const revalidate = 60

export default async function BlogPage() {
  const supabase = await createClient()
  const { data: posts } = await supabase
    .from('posts')
    .select('id, title, slug, excerpt, cover_image_url, published_at, created_at, published, content_json')
    .eq('published', true)
    .order('published_at', { ascending: false })

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900 mb-3">Blog</h1>
      <p className="text-gray-500 mb-12">Thoughts on engineering, software, and building things.</p>

      {!posts?.length ? (
        <p className="text-gray-400">Posts coming soon.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((post: Post) => (
            <BlogCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}
