'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Supabase password-recovery links drop a hash token on whatever page the
// Site URL points to. This component detects type=recovery in the hash and
// forwards the user (hash included) to the dedicated update-password page.
export default function AuthHashRedirect() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (hash.includes('type=recovery')) {
      router.replace('/auth/update-password' + hash)
    }
  }, [router])

  return null
}
