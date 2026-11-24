import { afterEach, describe, expect, it } from 'vitest'
import type { MusicMode } from '@nexus/core'
import { watchFocusMusic } from './focusMusic'
import { applyMoveCode, finishSpotifyLogin, moveCode, setSpotifySettings, spotifyStore, unlinkSpotify } from './spotify'

type Call = { url: string; method: string; body?: string }

function fakeSpotify(handler: (c: Call) => { status: number; json?: unknown } = () => ({ status: 204 })) {
  const calls: Call[] = []
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const c = { url: String(input), method: init?.method ?? 'GET', body: init?.body ? String(init.body) : undefined }
    calls.push(c)
    const r = c.url.includes('/api/token') ? { status: 200, json: { access_token: 'a1', refresh_token: 'r1', expires_in: 3600 } } : handler(c)
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status })
  }) as typeof fetch
  return { calls, fetcher }
}

describe('Spotify', () => {
  afterEach(() => {
    unlinkSpotify()
    localStorage.clear()
  })

  it('finishes the login only with the state it started', async () => {
    const { fetcher, calls } = fakeSpotify()
    localStorage.setItem('nexus.spotify.verifier', JSON.stringify({ verifier: 'v', state: 's1' }))
    expect(await finishSpotifyLogin({ pathname: '/spotify', search: '?code=c&state=wrong' }, fetcher)).toBe(true)
    expect(spotifyStore.getSnapshot()).toMatchObject({ linked: false, problem: expect.stringContaining('liep fout') })
    localStorage.setItem('nexus.spotify.verifier', JSON.stringify({ verifier: 'v', state: 's1' }))
    await finishSpotifyLogin({ pathname: '/spotify', search: '?code=c&state=s1' }, fetcher)
    expect(calls.at(-1)?.body).toContain('code_verifier=v')
    expect(spotifyStore.getSnapshot()).toMatchObject({ linked: true, problem: null })
    expect(await finishSpotifyLogin({ pathname: '/', search: '' }, fetcher)).toBe(false)
  })

  it('moves the link to the desktop app with a code', async () => {
    const { fetcher } = fakeSpotify()
    localStorage.setItem('nexus.spotify.auth', JSON.stringify({ access: 'a', refresh: 'rr', expiresAt: 0 }))
    const code = moveCode()
    expect(code).toBe('nxsp1.rr')
    expect(spotifyStore.getSnapshot().linked).toBe(false)
    expect(await applyMoveCode('iets anders', fetcher)).toMatch(/geen koppelcode/)
    expect(await applyMoveCode(code!, fetcher)).toBeNull()
    expect(spotifyStore.getSnapshot().linked).toBe(true)
  })

  it('plays the study playlist with the focus timer and pauses in a break', async () => {
    localStorage.setItem('nexus.spotify.auth', JSON.stringify({ access: 'a', refresh: 'r', expiresAt: Date.now() + 3_600_000 }))
    setSpotifySettings({ study: { uri: 'spotify:playlist:37i9dQZF1DX8NTLI2TtZa6', name: 'Lofi' }, shuffle: false })
    const calls: string[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(input).replace('https://api.spotify.com/v1', '')} ${init?.body ?? ''}`.trim())
      return new Response(null, { status: 204 })
    }) as typeof fetch
    try {
      let mode: MusicMode = 'off'
      const listeners = new Set<() => void>()
      const store = { subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)) }
      const stop = watchFocusMusic(() => mode, [store])
      const go = async (m: MusicMode) => {
        mode = m
        listeners.forEach((l) => l())
        await new Promise((r) => setTimeout(r, 0))
        await new Promise((r) => setTimeout(r, 0))
      }
      await go('study')
      await go('rest')
      await go('study')
      stop()
      expect(calls).toEqual(['PUT /me/player/play {"context_uri":"spotify:playlist:37i9dQZF1DX8NTLI2TtZa6"}', 'PUT /me/player/pause', 'PUT /me/player/play'])
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
