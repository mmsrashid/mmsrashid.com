# Phase 1A: Foundation + Public Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the mmsrashid.com Next.js project with Supabase, deploy it to Vercel, and build all public-facing pages (home, portfolio, CV, blog, login) plus the visitor chat widget.

**Architecture:** Single Next.js 14 App Router application. Public routes live in `app/(public)/` and are statically rendered. A `middleware.ts` guards all `/dashboard/*` routes with a Supabase session check. The visitor chat widget posts to an API route that saves to Supabase and sends an email notification via Resend.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS v3, Supabase (`@supabase/ssr`), Resend (transactional email), Jest + React Testing Library, Vercel

---

## File Map

```
app/
  layout.tsx                         # Root layout (fonts, globals)
  globals.css                        # Tailwind directives + base styles
  (public)/
    layout.tsx                       # Public layout: Navbar + Footer + ChatWidget
    page.tsx                         # Home: hero, bio, links
    portfolio/
      page.tsx                       # Portfolio: grid of ProjectCards from Supabase
    cv/
      page.tsx                       # CV: timeline, education, skills, PDF download
    blog/
      page.tsx                       # Blog list: published posts from Supabase
      [slug]/
        page.tsx                     # Individual blog post
    login/
      page.tsx                       # Login form (Supabase email/password)
  api/
    auth/
      callback/
        route.ts                     # Supabase OAuth callback handler
    chat-widget/
      route.ts                       # POST: save visitor message, send email

components/
  Navbar.tsx                         # Top nav: logo, links, login button
  Footer.tsx                         # Footer: copyright, social links
  ChatWidget.tsx                     # Floating chat button + slide-in panel
  ProjectCard.tsx                    # Portfolio project card
  BlogCard.tsx                       # Blog post preview card

lib/
  supabase/
    client.ts                        # Browser Supabase client (singleton)
    server.ts                        # Server Supabase client (per-request cookies)
    middleware.ts                    # Supabase session refresh helper
  types.ts                           # Shared TypeScript types (Project, Post, VisitorMessage)

middleware.ts                        # Next.js middleware: refresh session + protect /dashboard

supabase/
  migrations/
    001_initial.sql                  # Phase 1A schema: projects, posts, visitor_messages

__tests__/
  components/
    Navbar.test.tsx
    ChatWidget.test.tsx
    ProjectCard.test.tsx
    BlogCard.test.tsx
  api/
    chat-widget.test.ts
  lib/
    types.test.ts

.env.local.example
next.config.ts
tailwind.config.ts
tsconfig.json
jest.config.ts
jest.setup.ts
```

---

## Task 1: Project Initialisation

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `globals.css`, `jest.config.ts`, `jest.setup.ts`, `.env.local.example`

- [ ] **Step 1: Bootstrap the Next.js project**

```bash
cd C:/Users/m/mmsrashid
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*"
```

When prompted, accept all defaults.

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr resend
npm install --save-dev jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event ts-jest @types/jest
```

- [ ] **Step 3: Configure Jest**

Create `jest.config.ts`:

```typescript
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
}

export default createJestConfig(config)
```

Create `jest.setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Create `.env.local.example`**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Resend (transactional email)
RESEND_API_KEY=re_your_key
RESEND_NOTIFY_TO=mohammedrashid@drtimpearce.com

# App
NEXT_PUBLIC_SITE_URL=https://mmsrashid.com
```

Copy to `.env.local` and fill in values after Supabase project is created.

- [ ] **Step 5: Update `next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
```

- [ ] **Step 6: Verify Jest runs**

```bash
npx jest --passWithNoTests
```

Expected: `Test Suites: 0 passed`

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "feat: initialise Next.js 14 project with TypeScript, Tailwind, Jest"
```

---

## Task 2: Supabase Clients + Schema

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`, `lib/types.ts`, `supabase/migrations/001_initial.sql`

- [ ] **Step 1: Write type definitions test**

Create `__tests__/lib/types.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest __tests__/lib/types.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/types'`

- [ ] **Step 3: Create `lib/types.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest __tests__/lib/types.test.ts
```

Expected: PASS

- [ ] **Step 5: Create `lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 6: Create `lib/supabase/server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {}
        },
      },
    },
  )
}
```

- [ ] **Step 7: Create `lib/supabase/middleware.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

- [ ] **Step 8: Create `middleware.ts` (root)**

```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 9: Write Supabase migration**

Create `supabase/migrations/001_initial.sql`:

```sql
-- Projects (portfolio items)
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  tags text[] not null default '{}',
  github_url text,
  live_url text,
  created_at timestamptz not null default now()
);

-- Blog posts
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text not null default '',
  content_json jsonb not null default '{}',
  cover_image_url text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

-- Visitor messages (from public chat widget)
create table public.visitor_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS: all tables private by default (only service role can insert/select)
alter table public.projects enable row level security;
alter table public.posts enable row level security;
alter table public.visitor_messages enable row level security;

-- Public read access for published posts and projects
create policy "Public can read projects" on public.projects
  for select using (true);

create policy "Public can read published posts" on public.posts
  for select using (published = true);

-- visitor_messages: public insert only (no read — only service role reads)
create policy "Public can submit visitor messages" on public.visitor_messages
  for insert with check (true);
```

- [ ] **Step 10: Apply migration in Supabase Dashboard**

Go to your Supabase project → SQL Editor → paste and run `001_initial.sql`.

- [ ] **Step 11: Commit**

```bash
git add .
git commit -m "feat: add Supabase clients, types, middleware, initial schema migration"
```

---

## Task 3: Root Layout + Tailwind Base Styles

**Files:**
- Modify: `app/layout.tsx`, `app/globals.css`

- [ ] **Step 1: Update `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
  }

  body {
    @apply bg-white text-gray-900 antialiased;
  }
}
```

- [ ] **Step 2: Update `app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Mohammed Rashid',
  description: 'Mechanical & Software Engineer',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mmsrashid.com'),
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "feat: configure root layout and Tailwind base styles"
```

---

## Task 4: Navbar + Footer Components

**Files:**
- Create: `components/Navbar.tsx`, `components/Footer.tsx`, `__tests__/components/Navbar.test.tsx`

- [ ] **Step 1: Write Navbar test**

Create `__tests__/components/Navbar.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import Navbar from '@/components/Navbar'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe('Navbar', () => {
  it('renders site name', () => {
    render(<Navbar />)
    expect(screen.getByText('MR')).toBeInTheDocument()
  })

  it('renders nav links', () => {
    render(<Navbar />)
    expect(screen.getByRole('link', { name: /portfolio/i })).toHaveAttribute('href', '/portfolio')
    expect(screen.getByRole('link', { name: /cv/i })).toHaveAttribute('href', '/cv')
    expect(screen.getByRole('link', { name: /blog/i })).toHaveAttribute('href', '/blog')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest __tests__/components/Navbar.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/Navbar'`

- [ ] **Step 3: Create `components/Navbar.tsx`**

```typescript
import Link from 'next/link'

const links = [
  { label: 'Portfolio', href: '/portfolio' },
  { label: 'CV', href: '/cv' },
  { label: 'Blog', href: '/blog' },
]

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl tracking-tight">
          MR
        </Link>
        <ul className="flex items-center gap-8">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest __tests__/components/Navbar.test.tsx
```

Expected: PASS

- [ ] **Step 5: Create `components/Footer.tsx`**

```typescript
export default function Footer() {
  return (
    <footer className="border-t border-gray-100 py-8 mt-24">
      <div className="max-w-5xl mx-auto px-6 flex items-center justify-between text-sm text-gray-500">
        <span>© {new Date().getFullYear()} Mohammed Rashid</span>
        <div className="flex gap-6">
          <a
            href="https://linkedin.com/in/mmsrashid"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-900 transition-colors"
          >
            LinkedIn
          </a>
          <a
            href="https://github.com/mmsrashid"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-900 transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add components/Navbar.tsx components/Footer.tsx __tests__/components/Navbar.test.tsx
git commit -m "feat: add Navbar and Footer components"
```

---

## Task 5: Chat Widget

**Files:**
- Create: `components/ChatWidget.tsx`, `app/api/chat-widget/route.ts`, `__tests__/components/ChatWidget.test.tsx`, `__tests__/api/chat-widget.test.ts`

- [ ] **Step 1: Write ChatWidget component test**

Create `__tests__/components/ChatWidget.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import ChatWidget from '@/components/ChatWidget'

describe('ChatWidget', () => {
  it('renders the chat button', () => {
    render(<ChatWidget />)
    expect(screen.getByRole('button', { name: /chat/i })).toBeInTheDocument()
  })

  it('opens the panel when chat button is clicked', () => {
    render(<ChatWidget />)
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /chat/i }))
    expect(screen.getByRole('form')).toBeInTheDocument()
  })

  it('shows name, email, message fields in the form', () => {
    render(<ChatWidget />)
    fireEvent.click(screen.getByRole('button', { name: /chat/i }))
    expect(screen.getByPlaceholderText(/your name/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/your email/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/your message/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest __tests__/components/ChatWidget.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/ChatWidget'`

- [ ] **Step 3: Create `components/ChatWidget.tsx`**

```typescript
'use client'

import { useState } from 'react'

type FormState = 'idle' | 'submitting' | 'success' | 'error'

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<FormState>('idle')
  const [form, setForm] = useState({ name: '', email: '', message: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('submitting')
    try {
      const res = await fetch('/api/chat-widget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      setState('success')
    } catch {
      setState('error')
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        aria-label="Chat"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gray-900 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-700 transition-colors"
      >
        {open ? '✕' : '💬'}
      </button>

      {/* Slide-in panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-1">Get in touch</h3>
          <p className="text-sm text-gray-500 mb-4">I'll get back to you shortly.</p>

          {state === 'success' ? (
            <p className="text-sm text-green-600 font-medium">Message sent! Thanks for reaching out.</p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                required
                type="text"
                placeholder="Your name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <input
                required
                type="email"
                placeholder="Your email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <textarea
                required
                placeholder="Your message"
                rows={3}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              />
              {state === 'error' && (
                <p className="text-xs text-red-500">Something went wrong. Please try again.</p>
              )}
              <button
                type="submit"
                disabled={state === 'submitting'}
                className="w-full bg-gray-900 text-white text-sm font-medium py-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {state === 'submitting' ? 'Sending…' : 'Send message'}
              </button>
            </form>
          )}
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest __tests__/components/ChatWidget.test.tsx
```

Expected: PASS

- [ ] **Step 5: Write API route test**

Create `__tests__/api/chat-widget.test.ts`:

```typescript
import { POST } from '@/app/api/chat-widget/route'
import { NextRequest } from 'next/server'

// Mock Supabase server client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue({ error: null }),
    }),
  }),
}))

// Mock Resend
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn().mockResolvedValue({ id: 'test-id' }),
    },
  })),
}))

describe('POST /api/chat-widget', () => {
  it('returns 200 for valid payload', async () => {
    const req = new NextRequest('http://localhost/api/chat-widget', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice', email: 'alice@example.com', message: 'Hello' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('returns 400 when required fields are missing', async () => {
    const req = new NextRequest('http://localhost/api/chat-widget', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 6: Run test to confirm it fails**

```bash
npx jest __tests__/api/chat-widget.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/chat-widget/route'`

- [ ] **Step 7: Create `app/api/chat-widget/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, email, message } = body

  if (!name || !email || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.from('visitor_messages').insert({ name, email, message })

  if (error) {
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
  }

  await resend.emails.send({
    from: 'website@mmsrashid.com',
    to: process.env.RESEND_NOTIFY_TO!,
    subject: `New message from ${name}`,
    text: `From: ${name} <${email}>\n\n${message}`,
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 8: Run test to confirm it passes**

```bash
npx jest __tests__/api/chat-widget.test.ts
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add components/ChatWidget.tsx app/api/chat-widget/ __tests__/
git commit -m "feat: add visitor chat widget and API route with Resend notification"
```

---

## Task 6: Public Layout

**Files:**
- Create: `app/(public)/layout.tsx`

- [ ] **Step 1: Create `app/(public)/layout.tsx`**

```typescript
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import ChatWidget from '@/components/ChatWidget'

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <Navbar />
      <main className="pt-16 min-h-screen">{children}</main>
      <Footer />
      <ChatWidget />
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(public)/layout.tsx
git commit -m "feat: add public layout with Navbar, Footer, ChatWidget"
```

---

## Task 7: Home Page

**Files:**
- Create: `app/(public)/page.tsx`

- [ ] **Step 1: Create `app/(public)/page.tsx`**

```typescript
import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-24">
      <div className="max-w-2xl">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900 mb-4">
          Mohammed Rashid
        </h1>
        <p className="text-xl text-gray-500 mb-8">
          Mechanical &amp; Software Engineer
        </p>
        <p className="text-lg text-gray-600 mb-12 leading-relaxed">
          I build software that solves real problems. MEng in Mechanical Engineering,
          working in software. Based in the UK.
        </p>

        <div className="flex flex-wrap gap-4">
          <Link
            href="/portfolio"
            className="inline-flex items-center px-6 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
          >
            View my work
          </Link>
          <Link
            href="/cv"
            className="inline-flex items-center px-6 py-3 border border-gray-200 text-gray-700 rounded-lg font-medium hover:border-gray-400 transition-colors"
          >
            Download CV
          </Link>
          <a
            href="https://linkedin.com/in/mmsrashid"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-6 py-3 border border-gray-200 text-gray-700 rounded-lg font-medium hover:border-gray-400 transition-colors"
          >
            LinkedIn
          </a>
          <a
            href="https://github.com/mmsrashid"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-6 py-3 border border-gray-200 text-gray-700 rounded-lg font-medium hover:border-gray-400 transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Start dev server and verify home page renders**

```bash
npm run dev
```

Open http://localhost:3000. Confirm: name, title, bio, and four buttons are visible. Confirm the Navbar renders with MR logo and Portfolio/CV/Blog links.

- [ ] **Step 3: Commit**

```bash
git add app/(public)/page.tsx
git commit -m "feat: add home page with hero, bio, and CTA links"
```

---

## Task 8: ProjectCard + Portfolio Page

**Files:**
- Create: `components/ProjectCard.tsx`, `app/(public)/portfolio/page.tsx`, `__tests__/components/ProjectCard.test.tsx`

- [ ] **Step 1: Write ProjectCard test**

Create `__tests__/components/ProjectCard.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import ProjectCard from '@/components/ProjectCard'
import type { Project } from '@/lib/types'

const mockProject: Project = {
  id: '1',
  title: 'Test Project',
  description: 'A test project description',
  tags: ['React', 'TypeScript'],
  github_url: 'https://github.com/test/repo',
  live_url: null,
  created_at: '2026-01-01',
}

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe('ProjectCard', () => {
  it('renders project title and description', () => {
    render(<ProjectCard project={mockProject} />)
    expect(screen.getByText('Test Project')).toBeInTheDocument()
    expect(screen.getByText('A test project description')).toBeInTheDocument()
  })

  it('renders tech tags', () => {
    render(<ProjectCard project={mockProject} />)
    expect(screen.getByText('React')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })

  it('renders GitHub link when present', () => {
    render(<ProjectCard project={mockProject} />)
    expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute(
      'href',
      'https://github.com/test/repo',
    )
  })

  it('does not render live link when absent', () => {
    render(<ProjectCard project={mockProject} />)
    expect(screen.queryByRole('link', { name: /live/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest __tests__/components/ProjectCard.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/ProjectCard'`

- [ ] **Step 3: Create `components/ProjectCard.tsx`**

```typescript
import type { Project } from '@/lib/types'

export default function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="border border-gray-100 rounded-xl p-6 hover:border-gray-200 transition-colors">
      <h3 className="font-semibold text-gray-900 mb-2">{project.title}</h3>
      <p className="text-sm text-gray-500 mb-4 leading-relaxed">{project.description}</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {project.tags.map((tag) => (
          <span
            key={tag}
            className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex gap-4">
        {project.github_url && (
          <a
            href={project.github_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2"
          >
            GitHub
          </a>
        )}
        {project.live_url && (
          <a
            href={project.live_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2"
          >
            Live
          </a>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest __tests__/components/ProjectCard.test.tsx
```

Expected: PASS

- [ ] **Step 5: Create `app/(public)/portfolio/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import ProjectCard from '@/components/ProjectCard'
import type { Project } from '@/lib/types'

export const revalidate = 60

export default async function PortfolioPage() {
  const supabase = await createClient()
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900 mb-3">Portfolio</h1>
      <p className="text-gray-500 mb-12">A selection of projects I've built.</p>

      {!projects?.length ? (
        <p className="text-gray-400">Projects coming soon.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projects.map((project: Project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Verify portfolio page in browser**

Open http://localhost:3000/portfolio. Confirm it renders without errors (projects list will be empty until you add rows in Supabase).

- [ ] **Step 7: Commit**

```bash
git add components/ProjectCard.tsx app/(public)/portfolio/ __tests__/components/ProjectCard.test.tsx
git commit -m "feat: add ProjectCard component and portfolio page"
```

---

## Task 9: CV Page

**Files:**
- Create: `app/(public)/cv/page.tsx`

- [ ] **Step 1: Create `app/(public)/cv/page.tsx`**

Update this file with your actual experience before deploying. The structure is:

```typescript
export default function CVPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <div className="flex items-start justify-between mb-12">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Mohammed Rashid</h1>
          <p className="text-gray-500">Mechanical &amp; Software Engineer</p>
        </div>
        <a
          href="/cv.pdf"
          download
          className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
        >
          Download PDF
        </a>
      </div>

      {/* Experience */}
      <section className="mb-12">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-6">Experience</h2>
        <div className="space-y-8">
          <div className="flex gap-6">
            <div className="w-2 h-2 rounded-full bg-gray-300 mt-2 flex-shrink-0" />
            <div>
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-gray-900">Software Engineer</h3>
                <span className="text-sm text-gray-400">2022 – Present</span>
              </div>
              <p className="text-sm text-gray-500 mb-1">Company Name</p>
              <p className="text-sm text-gray-600 leading-relaxed">
                Brief description of responsibilities and achievements.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Education */}
      <section className="mb-12">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-6">Education</h2>
        <div className="flex gap-6">
          <div className="w-2 h-2 rounded-full bg-gray-300 mt-2 flex-shrink-0" />
          <div>
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold text-gray-900">MEng Mechanical Engineering</h3>
              <span className="text-sm text-gray-400">2017 – 2021</span>
            </div>
            <p className="text-sm text-gray-500">University Name</p>
          </div>
        </div>
      </section>

      {/* Skills */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-6">Skills</h2>
        <div className="flex flex-wrap gap-2">
          {[
            'TypeScript', 'React', 'Next.js', 'Node.js', 'Python',
            'SQL', 'CAD', 'FEA', 'Project Management',
          ].map((skill) => (
            <span key={skill} className="text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
              {skill}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Add your CV PDF to `public/cv.pdf`**

Place your CV PDF at `public/cv.pdf`. The download button links to this file.

- [ ] **Step 3: Verify CV page in browser**

Open http://localhost:3000/cv. Confirm the layout renders and the download button is present.

- [ ] **Step 4: Commit**

```bash
git add app/(public)/cv/
git commit -m "feat: add CV page with experience timeline, education, skills, PDF download"
```

---

## Task 10: BlogCard + Blog Pages

**Files:**
- Create: `components/BlogCard.tsx`, `app/(public)/blog/page.tsx`, `app/(public)/blog/[slug]/page.tsx`, `__tests__/components/BlogCard.test.tsx`

- [ ] **Step 1: Write BlogCard test**

Create `__tests__/components/BlogCard.test.tsx`:

```typescript
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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest __tests__/components/BlogCard.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/BlogCard'`

- [ ] **Step 3: Create `components/BlogCard.tsx`**

```typescript
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
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest __tests__/components/BlogCard.test.tsx
```

Expected: PASS

- [ ] **Step 5: Create `app/(public)/blog/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import BlogCard from '@/components/BlogCard'
import type { Post } from '@/lib/types'

export const revalidate = 60

export default async function BlogPage() {
  const supabase = await createClient()
  const { data: posts } = await supabase
    .from('posts')
    .select('id, title, slug, excerpt, cover_image_url, published_at, created_at, published')
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
```

- [ ] **Step 6: Create `app/(public)/blog/[slug]/page.tsx`**

```typescript
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
```

- [ ] **Step 7: Install Tiptap HTML package**

```bash
npm install @tiptap/html @tiptap/starter-kit
```

- [ ] **Step 8: Verify blog pages in browser**

Open http://localhost:3000/blog. Confirm it renders without errors. Open http://localhost:3000/blog/non-existent — confirm it returns a 404.

- [ ] **Step 9: Commit**

```bash
git add components/BlogCard.tsx app/(public)/blog/ __tests__/components/BlogCard.test.tsx
git commit -m "feat: add BlogCard, blog list page, and individual post page with Tiptap HTML rendering"
```

---

## Task 11: Login Page + Auth Callback

**Files:**
- Create: `app/(public)/login/page.tsx`, `app/api/auth/callback/route.ts`

- [ ] **Step 1: Create `app/api/auth/callback/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
```

- [ ] **Step 2: Create `app/(public)/login/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Sign in</h1>
        <p className="text-sm text-gray-500 mb-8">Access your dashboard</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white py-2.5 rounded-lg font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify login page in browser**

Open http://localhost:3000/login. Confirm the form renders. Try signing in with wrong credentials — confirm "Invalid email or password." appears.

- [ ] **Step 4: Create your Supabase user**

In Supabase Dashboard → Authentication → Users → Add User. Use your email and a strong password. This is the only user that will ever exist.

- [ ] **Step 5: Test the full login flow**

Go to http://localhost:3000/login, sign in with your credentials. Confirm you are redirected to `/dashboard` (which will 404 for now — that's fine, the redirect confirms auth works).

- [ ] **Step 6: Test that `/dashboard` redirects unauthenticated users to `/login`**

Open a private/incognito browser tab, go directly to http://localhost:3000/dashboard. Confirm you are redirected to http://localhost:3000/login.

- [ ] **Step 7: Commit**

```bash
git add app/(public)/login/ app/api/auth/
git commit -m "feat: add login page and Supabase auth callback, middleware protects /dashboard"
```

---

## Task 12: Run Full Test Suite + Deploy to Vercel

**Files:**
- Create: `.gitignore` additions, `vercel.json` (if needed)

- [ ] **Step 1: Run all tests**

```bash
npx jest --coverage
```

Expected: All tests pass. Coverage report generated.

- [ ] **Step 2: Run a production build locally**

```bash
npm run build
```

Expected: Build completes with no errors. Note any warnings and fix TypeScript errors before proceeding.

- [ ] **Step 3: Add Supabase session config to `next.config.ts`**

The `@supabase/ssr` package requires cookies. Ensure the config does not strip them:

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
```

(No changes needed if already set in Task 1.)

- [ ] **Step 4: Push to GitHub**

```bash
git remote add origin https://github.com/mmsrashid/mmsrashid.com.git
git branch -M main
git push -u origin main
```

- [ ] **Step 5: Deploy to Vercel**

1. Go to vercel.com → New Project → Import your GitHub repo
2. Framework preset: Next.js (auto-detected)
3. Add all environment variables from `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `RESEND_NOTIFY_TO`
   - `NEXT_PUBLIC_SITE_URL` → `https://mmsrashid.com`
4. Click Deploy

- [ ] **Step 6: Configure custom domain**

In Vercel → Project → Settings → Domains → Add `mmsrashid.com`. Follow the DNS instructions (typically add an A record and CNAME to your domain registrar).

- [ ] **Step 7: Smoke test the live site**

- [ ] `https://mmsrashid.com` loads and shows hero
- [ ] `https://mmsrashid.com/portfolio` loads without error
- [ ] `https://mmsrashid.com/cv` loads, PDF download works
- [ ] `https://mmsrashid.com/blog` loads without error
- [ ] `https://mmsrashid.com/login` loads, login form visible
- [ ] `https://mmsrashid.com/dashboard` redirects to `/login`
- [ ] Chat widget appears on all public pages
- [ ] Submit a test message via chat widget, confirm you receive the email notification

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "chore: production ready — all smoke tests passing on mmsrashid.com"
```

---

## Self-Review

**Spec coverage:**
- Home page ✓ (Task 7)
- Portfolio page with ProjectCard ✓ (Task 8)
- CV page with PDF download ✓ (Task 9)
- Blog list page ✓ (Task 10)
- Individual blog post page ✓ (Task 10)
- Login page ✓ (Task 11)
- Visitor chat widget ✓ (Task 5)
- API route for chat widget ✓ (Task 5)
- Email notification on visitor message ✓ (Task 5)
- Middleware protecting `/dashboard` ✓ (Task 2)
- Supabase schema for Phase 1A tables ✓ (Task 2)
- Vercel deployment ✓ (Task 12)

**What this plan does NOT cover (separate plans):**
- Dashboard shell + sidebar layout → Plan 1B
- Blog editor with Tiptap → Plan 1B
- Kanban board → Plan 1C
- Email hub (Gmail/Outlook OAuth) → Plan 1D
