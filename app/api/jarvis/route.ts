import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { TOOLS, executeTool } from '@/lib/jarvis-tools'
import { readMemories } from '@/lib/jarvis-memory'

export const runtime = 'nodejs'
export const maxDuration = 60

const client = new Anthropic()

const SYSTEM_PROMPT = `You are JARVIS, a personal AI assistant for Mohammed Rashid. You have a calm, confident, slightly formal British tone — helpful and direct, never verbose.

You have access to Mohammed's email inbox and Google Calendar (personal and work). Use tools when the user asks about their schedule, emails, or wants information from those systems.

When you have retrieved data, summarise it conversationally — don't dump raw JSON at the user.

Current memories about Mohammed:`

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages } = await req.json() as { messages: Anthropic.MessageParam[] }

  const memories = await readMemories(user.id)
  const memorySummary = memories.length > 0
    ? memories.map(m => `- [${m.type}] ${m.content}`).join('\n')
    : '(none yet)'

  const systemPrompt = `${SYSTEM_PROMPT}\n${memorySummary}`

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: systemPrompt,
          tools: TOOLS,
          messages,
        })

        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`))
          }

          if (event.type === 'message_delta' && event.delta.stop_reason === 'tool_use') {
            // Handle tool calls — get the full message to extract tool use blocks
          }
        }

        // Check if we need to handle tool calls
        const finalMessage = await response.finalMessage()

        if (finalMessage.stop_reason === 'tool_use') {
          // Execute all tool calls
          const toolResults: Anthropic.ToolResultBlockParam[] = []

          for (const block of finalMessage.content) {
            if (block.type === 'tool_use') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'tool_start', name: block.name })}\n\n`))
              const result = await executeTool(block.name, block.input as Record<string, unknown>)
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'tool_end', name: block.name })}\n\n`))
            }
          }

          // Send tool results back and stream final response
          const followUp = client.messages.stream({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system: systemPrompt,
            tools: TOOLS,
            messages: [
              ...messages,
              { role: 'assistant', content: finalMessage.content },
              { role: 'user', content: toolResults },
            ],
          })

          for await (const event of followUp) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`))
            }
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (err) {
        console.error('Jarvis API error:', err)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Something went wrong' })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
