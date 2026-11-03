import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST, validAction } from '../../../../api/push-action'

const body = { ref: 'deadline:0b6e3f2a-1c2d-4e5f-8a9b-0c1d2e3f4a5b@100-60', token: 'abcdefghijklmnopqrstuvwxyz012345', action: 'done' }
const post = (b: unknown) => POST(new Request('https://nexus.test/api/push-action', { method: 'POST', body: JSON.stringify(b) }))

describe('/api/push-action', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('checks what the phone sends', () => {
    expect(validAction(body)).toBe(true)
    expect(validAction({ ...body, action: 'delete' })).toBe(false)
    expect(validAction({ ...body, token: 'kort' })).toBe(false)
    expect(validAction({ ...body, token: 'met spaties en meer dan twintig tekens' })).toBe(false)
  })

  it('hands the tap to the database function and passes its answer on', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co/rest/v1/')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    const fetch = vi.fn(async () => new Response(JSON.stringify('klaar'), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const response = await post(body)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ result: 'klaar' })
    expect(fetch).toHaveBeenCalledWith('https://abc.supabase.co/rest/v1/rpc/push_action', expect.objectContaining({ body: JSON.stringify({ p_ref: body.ref, p_token: body.token, p_action: 'done' }) }))
  })

  it('refuses bad input before it reaches the database', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect((await post({ ...body, action: 'x' })).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })
})
