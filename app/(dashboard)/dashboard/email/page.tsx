import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function EmailPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: messages } = await supabase
    .from('visitor_messages')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Email</h1>
      <p className="text-sm text-gray-500 mb-8">Gmail / Outlook integration coming soon. Showing visitor messages for now.</p>

      {!messages?.length ? (
        <p className="text-sm text-gray-400">No visitor messages yet.</p>
      ) : (
        <div className="space-y-2 max-w-2xl">
          {messages.map((msg) => (
            <div key={msg.id} className={`bg-white border rounded-lg px-5 py-4 ${msg.read ? 'border-gray-200 opacity-60' : 'border-gray-900'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{msg.name}</p>
                  <p className="text-xs text-gray-400">{msg.email}</p>
                </div>
                <p className="text-xs text-gray-400">
                  {new Date(msg.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <p className="text-sm text-gray-700 mt-2">{msg.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
