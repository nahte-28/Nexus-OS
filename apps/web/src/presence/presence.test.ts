import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Presence, presenceError, startPresence } from './presence'

function client(signedIn = true) {
  const rpc = vi.fn(async (name: string) => ({ data: name === 'presence_list' ? [{ user_id: 'z', state: 'busy', note: 'Examen', last_seen: '2026-11-13T15:00:00Z' }] : null, error: null }))
  return {
    rpc,
    auth: {
      getSession: async () => ({ data: { session: signedIn ? { user: { id: 'me' } } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  } as unknown as SupabaseClient & { rpc: typeof rpc }
}

describe('wie is er online op Supabase', () => {
  afterEach(() => vi.useRealTimers())

  it('vraagt de SQL-stap als die ontbreekt', () => {
    expect(presenceError({ code: 'PGRST202', message: 'Could not find the function public.presence_list' })).toBe('setup:supabase/migrations/20261113210000_presence.sql')
  })

  it('leest vrienden en teamgenoten per id', async () => {
    const map = await new Presence(client()).list()
    expect(map.get('z')).toEqual({ userId: 'z', state: 'busy', note: 'Examen', lastSeen: Date.parse('2026-11-13T15:00:00Z') })
  })

  it('pingt alleen aangemeld en met de module aan, elke minuut', async () => {
    vi.useFakeTimers()
    const c = client()
    let on = true
    const stop = startPresence(c, () => on)
    await vi.advanceTimersByTimeAsync(0)
    expect(c.rpc).toHaveBeenCalledWith('presence_ping')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(c.rpc).toHaveBeenCalledTimes(2)
    on = false
    await vi.advanceTimersByTimeAsync(60_000)
    expect(c.rpc).toHaveBeenCalledTimes(2)
    stop()
    const out = client(false)
    startPresence(out, () => true)()
    await vi.advanceTimersByTimeAsync(0)
    expect(out.rpc).not.toHaveBeenCalled()
  })
})
