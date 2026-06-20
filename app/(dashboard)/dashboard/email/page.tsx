import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EmailInbox from './EmailInbox'

export const metadata = { title: 'Email · Dashboard' }

export default async function EmailPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <EmailInbox />
    </div>
  )
}
