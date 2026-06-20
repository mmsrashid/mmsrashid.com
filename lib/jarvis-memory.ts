import { createClient } from '@/lib/supabase/server'

export interface Memory {
  id: string
  type: 'fact' | 'preference' | 'context'
  content: string
  created_at: string
}

export async function readMemories(userId: string): Promise<Memory[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('jarvis_memories')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
  return (data as Memory[]) ?? []
}

export async function saveMemory(
  userId: string,
  type: Memory['type'],
  content: string,
): Promise<void> {
  const supabase = await createClient()
  await supabase.from('jarvis_memories').insert({ user_id: userId, type, content })
}
