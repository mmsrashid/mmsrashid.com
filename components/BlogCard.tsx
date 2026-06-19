import Link from 'next/link'
import type { Post } from '@/lib/types'

export default function BlogCard({ post }: { post: Post }) {
  const date = post.published_at
    ? new Date(post.published_at).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <Link href={`/blog/${post.slug}`} className="block group">
      <article className="border border-gray-100 rounded-xl p-6 group-hover:border-gray-200 transition-colors">
        <time className="text-xs text-gray-400 mb-3 block">{date}</time>
        <h2 className="font-semibold text-gray-900 mb-2 group-hover:text-gray-600 transition-colors">
          {post.title}
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">{post.excerpt}</p>
      </article>
    </Link>
  )
}
