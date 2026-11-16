import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST, validReply } from '../../../../api/push-reply'

const token = 'f'.repeat(64)
const id = '0b6e3f2a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
const sealed = { [id]: { ephemeralKey: 'a', iv: 'b', ciphertext: 'c' } }
const post = (b: unknown) => POST(new Request('https://nexus.test/api/push-reply', { method: 'POST', body: JSON.stringify(b) }))

describe('/api/push-reply', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('checks what the phone sends', () => {
    expect(validReply({ step: 'keys', token })).toBe(true)
    expect(validReply({ step: 'send', token, text: 'Oké 👍', envelopes: sealed })).toBe(true)
    expect(validReply({ step: 'send', token, text: 'Oké 👍', envelopes: null })).toBe(true)
    expect(validReply({ step: 'keys', token: 'kort' })).toBe(false)
    expect(validReply({ step: 'send', token, text: '', envelopes: null })).toBe(false)
    expect(validReply({ step: 'send', token, text: 'x'.repeat(201), envelopes: null })).toBe(false)
    expect(validReply({ step: 'send', token, text: 'Oké', envelopes: { 'geen-id': sealed[id] } })).toBe(false)
    expect(validReply({ step: 'send', token, text: 'Oké', envelopes: {} })).toBe(false)
    expect(validReply({ step: 'wis', token })).toBe(false)
  })

  it('asks the database for the keys, then sends the answer with the token', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co/rest/v1/')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('message_reply_keys') ? { kind: 'dm', devices: [] } : 'verstuurd'), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect(await (await post({ step: 'keys', token })).json()).toEqual({ kind: 'dm', devices: [] })
    const sent = await post({ step: 'send', token, text: 'Oké 👍', envelopes: sealed })
    expect(sent.status).toBe(200)
    expect(await sent.json()).toEqual({ result: 'verstuurd' })
    expect(fetch).toHaveBeenLastCalledWith('https://abc.supabase.co/rest/v1/rpc/message_reply', expect.objectContaining({ body: JSON.stringify({ p_token: token, p_text: 'Oké 👍', p_envelopes: sealed }) }))
  })

  it('passes an unknown token on as onbekend and refuses bad input first', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    const fetch = vi.fn(async () => new Response('null', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect((await post({ step: 'keys', token })).status).toBe(409)
    fetch.mockClear()
    expect((await post({ step: 'keys', token: 'x' })).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })
})
