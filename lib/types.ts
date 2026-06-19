export type Project = {
  id: string
  title: string
  description: string
  tags: string[]
  github_url: string | null
  live_url: string | null
  created_at: string
}

export type Post = {
  id: string
  title: string
  slug: string
  excerpt: string
  content_json: Record<string, unknown>
  cover_image_url: string | null
  published: boolean
  published_at: string | null
  created_at: string
}

export type VisitorMessage = {
  id: string
  name: string
  email: string
  message: string
  created_at: string
  read: boolean
}
