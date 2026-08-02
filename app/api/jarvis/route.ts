import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { TOOLS, executeTool } from '@/lib/jarvis-tools'
import { readMemories } from '@/lib/jarvis-memory'

export const runtime = 'nodejs'
export const maxDuration = 60

const client = new Anthropic()

const SYSTEM_PROMPT = `You are JARVIS, a personal AI assistant for Mohammed Rashid. You have a calm, confident, slightly formal British tone — helpful and direct, never verbose.

You have access to Mohammed's email inbox, Google Calendar (personal and work), and his Health Records — blood test results and their history, medicines, appointments, documents, sleep, nutrition, exercise and pill adherence. Use tools when asked about any of these; never claim you cannot see the health records.

You can also add a marker to the blood catalogue when a lab name is missing. If you are unsure of the units, add it without a reference range and say so — a wrong range would label an abnormal result as normal.

When you have retrieved data, summarise it conversationally — don't dump raw JSON at the user.

You are not a clinician. Report what the records say, flag what looks out of range, and suggest discussing anything concerning with their doctor. Never diagnose or recommend changing a medication.

Current memories about Mohammed:`

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages, context } = await req.json() as {
    messages: Anthropic.MessageParam[]
    context?: string
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('messages must be a non-empty array', { status: 400 })
  }

  const memories = await readMemories(user.id)
  const memorySummary = memories.length > 0
    ? memories.map(m => `- [${m.type}] ${m.content}`).join('\n')
    : '(none yet)'

  const healthNote = context === 'health'
    ? `\n\nThe user is viewing their Health Records. Questions are most likely about appointments, medicines, blood test results, documents or pill adherence. They can also upload a lab report or a screenshot of one and you will file it automatically.`
    : ''

  const systemPrompt = `${SYSTEM_PROMPT}\n${memorySummary}${healthNote}`

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Loop rather than a single follow-up: a question often needs two hops
        // (find the marker, then read its history). With only one round the
        // second request was dropped and the user got an empty answer.
        const MAX_ROUNDS = 5
        let convo: Anthropic.MessageParam[] = messages

        for (let round = 0; round < MAX_ROUNDS; round++) {
          const response = client.messages.stream({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system: systemPrompt,
            tools: TOOLS,
            messages: convo,
          })

          for await (const event of response) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`))
            }
          }

          const finalMessage = await response.finalMessage()
          if (finalMessage.stop_reason !== 'tool_use') break

          const toolResults: Anthropic.ToolResultBlockParam[] = []
          for (const block of finalMessage.content) {
            if (block.type === 'tool_use') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'tool_start', name: block.name })}\n\n`))
              const result = await executeTool(block.name, block.input as Record<string, unknown>, { supabase, userId: user.id })
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'tool_end', name: block.name })}\n\n`))
            }
          }

          convo = [
            ...convo,
            { role: 'assistant', content: finalMessage.content },
            { role: 'user', content: toolResults },
          ]

          // Don't leave the user staring at nothing if the model keeps looping.
          if (round === MAX_ROUNDS - 1) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: '\n\nI wasn’t able to finish that lookup — try asking more specifically.' })}\n\n`))
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
