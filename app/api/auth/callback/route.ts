import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  const type = searchParams.get('type')
  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/auth/update-password`)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
