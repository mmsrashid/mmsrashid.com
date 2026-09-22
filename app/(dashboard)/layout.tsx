'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import JarvisOrb from '@/components/JarvisOrb'

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: '⊞' },
  { href: '/dashboard/blog', label: 'Blog', icon: '✏️' },
  { href: '/dashboard/kanban', label: 'Kanban', icon: '▦' },
  { href: '/dashboard/email', label: 'Email', icon: '✉' },
  { href: '/dashboard/calendar', label: 'Calendar', icon: '📅' },
  { href: '/dashboard/health', label: 'Health', icon: '🏥' },
  { href: '/dashboard/money', label: 'Money', icon: '💰' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [navOpen, setNavOpen] = useState(false)

  // A drawer left open would cover whichever page was just navigated to.
  useEffect(() => { setNavOpen(false) }, [pathname])

  async function handleSignOut() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    await supabase.auth.signOut()
    router.push('/login')
  }

  const current = NAV.find(n => n.href !== '/dashboard' && pathname.startsWith(n.href))
    ?? NAV[0]

  /**
   * The nav itself, used by both the fixed sidebar and the mobile drawer.
   *
   * Shared rather than duplicated: two copies of a menu drift apart, and the
   * one nobody looks at is the one that goes stale.
   */
  const nav = (
    <>
      <div className="px-4 py-5 border-b border-gray-100">
        <Link href="/" className="text-sm font-bold tracking-tight text-gray-900">MR</Link>
        <p className="text-xs text-gray-400 mt-0.5">Dashboard</p>
      </div>
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                active
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="px-4 py-4 border-t border-gray-100">
        <button
          onClick={handleSignOut}
          className="w-full text-left text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          Sign out →
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Fixed sidebar, tablet and up. On a phone it ate 56 of the 94 available
          rem and pushed every page off screen, so below md it is a drawer. */}
      <aside className="hidden md:flex w-56 shrink-0 bg-white border-r border-gray-200 flex-col">
        {nav}
      </aside>

      {navOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <button
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="relative w-64 max-w-[82%] bg-white flex flex-col h-full shadow-xl">
            {nav}
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Phone-only top bar. Names the section as well as opening the menu —
            without the sidebar there is otherwise nothing saying where you are. */}
        <div className="md:hidden flex items-center gap-3 px-3 h-12 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="text-xl leading-none text-gray-700 px-1 -ml-1"
          >
            ☰
          </button>
          <span className="text-sm font-bold text-gray-900">MR</span>
          <span className="text-xs text-gray-400">{current.icon} {current.label}</span>
        </div>
        {children}
      </main>

      <JarvisOrb />
    </div>
  )
}
