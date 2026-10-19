import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowedEmails, checkMessages, POST } from '../../../../api/ai'

const request = (headers: Record<string, string> = {}, body = { messages: [{ role: 'user', content: 'Hoi' }] }) =>
  new Request('https://nexus.test/api/ai', { method: 'POST', headers, body: JSON.stringify(body) })

describe('NEXUS AI endpoint', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('says what is missing before it is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect((await response.json()).error).toContain('ANTHROPIC_API_KEY')
  })

  it('only serves logged-in accounts on the allow list', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
    vi.stubEnv('NEXUS_AI_ALLOWED_EMAILS', ' Ethan@Example.com ')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co/rest/v1/')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization
      if (auth === 'Bearer good') return new Response(JSON.stringify({ email: 'ethan@example.com' }))
      if (auth === 'Bearer other') return new Response(JSON.stringify({ email: 'iemand@example.com' }))
      return new Response('{}', { status: 401 })
    })
    vi.stubGlobal('fetch', fetchMock)

    expect((await POST(request())).status).toBe(401)
    expect((await POST(request({ authorization: 'Bearer expired' }))).status).toBe(401)
    expect((await POST(request({ authorization: 'Bearer other' }))).status).toBe(403)
    expect(fetchMock.mock.calls[0][0]).toBe('https://abc.supabase.co/auth/v1/user')
    expect((await POST(request({ authorization: 'Bearer good' }, { messages: [] } as never))).status).toBe(400)
  })

  it('checks the conversation shape', () => {
    expect(checkMessages([{ role: 'user', content: 'Hoi' }])).toBeNull()
    expect(checkMessages([{ role: 'assistant', content: 'Hoi' }])).not.toBeNull()
    expect(checkMessages([{ role: 'system', content: 'x' }])).not.toBeNull()
    expect(checkMessages('nee')).not.toBeNull()
    expect(allowedEmails('a@b.be, ,C@D.be')).toEqual(new Set(['a@b.be', 'c@d.be']))
  })
})
