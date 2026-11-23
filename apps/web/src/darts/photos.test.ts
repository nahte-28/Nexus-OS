import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyDarts, type HighFinish } from '@nexus/core'
import { checkDartsPhoto, POST } from '../../../../api/darts'
import { checkProof, getPhoto, readPhoto, removePhoto, savePhoto, storeProof } from './photos'
import { dartsStore } from './store'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('darts photos', () => {
  it('keeps a photo on the device', async () => {
    await savePhoto('m1', 0, 'data:image/jpeg;base64,AAAA', 5)
    expect(await getPhoto('m1', 0)).toEqual({ id: 'm1:0', matchId: 'm1', leg: 0, data: 'data:image/jpeg;base64,AAAA', at: 5 })
    await removePhoto('m1', 0)
    expect(await getPhoto('m1', 0)).toBeUndefined()
  })

  it('asks NEXUS AI for the darts and judges the finish', async () => {
    const lines = [{ type: 'text', text: '{"darts": ["T20", "T1' }, { type: 'text', text: '1", "D14"], "note": ""}' }, { type: 'done' }].map((e) => JSON.stringify(e) + '\n').join('')
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(lines))
    vi.stubGlobal('fetch', fetch)
    const reading = await readPhoto('data:image/jpeg;base64,AAAA', async () => 'token', '')
    expect(reading).toEqual({ darts: ['T20', 'T11', 'D14'], note: '' })
    expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toEqual({ image: 'AAAA' })
    await expect(readPhoto('x', async () => null, '')).rejects.toThrow(/Meld je aan/)

    const finish: HighFinish = { leg: 0, side: 0, finish: 121, darts: 3 }
    expect(await checkProof(finish, true, 'x', 7, async () => reading)).toEqual({ leg: 0, at: 7, verdict: 'ok', darts: ['T20', 'T11', 'D14'] })
    expect((await checkProof(finish, true, 'x', 7, async () => ({ darts: ['T20', 'T20'], note: 'Eén pijl verstopt' }))).verdict).toBe('nok')
  })

  it('only stores a proof while that finish is still there', () => {
    const match = {
      id: 'm2', mode: 301, legsToWin: 1, setsToWin: 1, doubleOut: true, players: ['Ethan'], members: [['Ethan']],
      legs: [{ set: 0, starter: 0, visits: [{ player: 0, score: 180, darts: 3, bust: false }, { player: 0, score: 121, darts: 3, bust: false }], winner: 0 }],
      winner: 0, startedAt: 0, finishedAt: 1, updatedAt: 1, deletedAt: null,
    }
    dartsStore.adopt({ ...emptyDarts(), matches: [match] })
    storeProof('m2', { leg: 0, at: 1, verdict: 'ok' }, 100)
    expect(dartsStore.getSnapshot().matches[0].proofs).toBeUndefined()
    storeProof('m2', { leg: 0, at: 1, verdict: 'ok' }, 121)
    expect(dartsStore.getSnapshot().matches[0].proofs).toEqual([{ leg: 0, at: 1, verdict: 'ok' }])
  })

  it('checks the request and needs a login', async () => {
    expect(checkDartsPhoto({ image: 'AAAA' })).toEqual({ ok: true, value: { image: 'AAAA' } })
    expect(checkDartsPhoto({ image: 'data:image/jpeg;base64,AAAA' })).toEqual({ ok: false, error: 'Deze foto is geen JPEG.' })
    expect(checkDartsPhoto({})).toEqual({ ok: false, error: 'Er is geen foto.' })
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
    vi.stubEnv('NEXUS_AI_ALLOWED_EMAILS', 'ethan@example.com')
    expect((await POST(new Request('https://nexus.test/api/darts', { method: 'POST', body: '{}' }))).status).toBe(401)
  })
})
