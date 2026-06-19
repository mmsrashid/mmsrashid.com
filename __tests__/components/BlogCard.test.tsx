import { render, screen } from '@testing-library/react'
import BlogCard from '@/components/BlogCard'
import type { Post } from '@/lib/types'

const mockPost: Post = {
  id: '1',
  title: 'My First Post',
  slug: 'my-first-post',
  excerpt: 'This is a short excerpt',
  content_json: {},
  cover_image_url: null,
  published: true,
  published_at: '2026-01-15T00:00:00Z',
  created_at: '2026-01-15T00:00:00Z',
}

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe('BlogCard', () => {
  it('renders post title', () => {
    render(<BlogCard post={mockPost} />)
    expect(screen.getByText('My First Post')).toBeInTheDocument()
  })

  it('renders excerpt', () => {
    render(<BlogCard post={mockPost} />)
    expect(screen.getByText('This is a short excerpt')).toBeInTheDocument()
  })

  it('links to correct slug', () => {
    render(<BlogCard post={mockPost} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/blog/my-first-post')
  })
})
