/**
 * @jest-environment node
 */
import { POST } from '@/app/api/chat-widget/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue({ error: null }),
    }),
  }),
}))

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
