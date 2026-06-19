import type { Project, Post, VisitorMessage } from '@/lib/types'

describe('types', () => {
  it('Project has required fields', () => {
    const project: Project = {
      id: '1',
      title: 'Test',
      description: 'Desc',
      tags: ['React'],
      github_url: null,
      live_url: null,
      created_at: '2026-01-01',
    }
    expect(project.title).toBe('Test')
  })

  it('Post has required fields', () => {
    const post: Post = {
      id: '1',
      title: 'Hello',
      slug: 'hello',
      excerpt: 'Short',
      content_json: {},
      cover_image_url: null,
      published: true,
      published_at: '2026-01-01',
      created_at: '2026-01-01',
    }
    expect(post.slug).toBe('hello')
  })

  it('VisitorMessage has required fields', () => {
    const msg: VisitorMessage = {
      id: '1',
      name: 'Alice',
      email: 'alice@example.com',
      message: 'Hello',
      created_at: '2026-01-01',
      read: false,
    }
    expect(msg.read).toBe(false)
  })
})
