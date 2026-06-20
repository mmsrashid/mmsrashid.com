import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function BlogDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: posts } = await supabase
    .from('posts')
    .select('id, title, slug, published, published_at, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="p-8 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Blog</h1>
          <p className="text-sm text-gray-500 mt-1">{posts?.length ?? 0} posts</p>
        </div>
        <Link
          href="/dashboard/blog/new"
          className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          New post
        </Link>
      </div>

      {!posts?.length ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No posts yet. <Link href="/dashboard/blog/new" className="text-gray-900 underline">Write your first post.</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/dashboard/blog/${post.id}`}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-5 py-4 hover:border-gray-400 transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{post.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">/{post.slug}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  post.published
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {post.published ? 'Published' : 'Draft'}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(post.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
