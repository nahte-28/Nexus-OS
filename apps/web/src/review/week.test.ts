import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkReviewRequest, POST } from '../../../../api/review'
import { notesStore } from '../state/notesStore'
import { autoReviewTick, reviewTeaser, saveReview, setAutoReview, streamReview } from './week'

// Sunday 1 November 2026, 20:00: the moment for the review of the week of Monday 26 October.
const sunday = new Date(2026, 10, 1, 20, 0).getTime()
const monday = new Date(2026, 9, 26).getTime()
const ndjson = (...events: unknown[]) => events.map((e) => JSON.stringify(e) + '\n').join('')
const stream = () => new Response(ndjson({ type: 'text', text: '## Je week\n- Drie deadlines ' }, { type: 'text', text: 'op tijd af.' }, { type: 'done' }))

describe('Weekoverzicht', () => {
  beforeEach(async () => {
    localStorage.clear()
    await notesStore.ready
    for (const n of notesStore.getSnapshot()) notesStore.remove(n.id)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('checks the request and needs a login', async () => {
    expect(checkReviewRequest({ facts: 'Lessen: 12' })).toEqual({ ok: true, facts: 'Lessen: 12', wish: '' })
    expect(checkReviewRequest({ facts: '  ' })).toMatchObject({ ok: false })
    expect(checkReviewRequest({ facts: 'x'.repeat(20_001) })).toMatchObject({ ok: false })
    expect(checkReviewRequest({ facts: 'x', wish: ' woensdag vrij ' })).toMatchObject({ wish: 'woensdag vrij' })
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
    vi.stubEnv('NEXUS_AI_ALLOWED_EMAILS', 'ethan@example.com')
    const response = await POST(new Request('https://nexus.test/api/review', { method: 'POST', body: '{}' }))
    expect(response.status).toBe(401)
  })

  it('streams the review and saves one note per week', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => stream()))
    const text = await streamReview('feiten', '', () => {}, async () => 'token', '')
    expect(text).toBe('## Je week\n- Drie deadlines op tijd af.')
    await expect(streamReview('feiten', '', () => {}, async () => null, '')).rejects.toThrow(/Meld je aan/)

    const first = saveReview(monday, 'Eerste', sunday)
    const second = saveReview(monday, 'Tweede', sunday)
    expect(second).toBe(first)
    const notes = notesStore.getSnapshot().filter((n) => n.title === 'Weekoverzicht week 44')
    expect(notes).toHaveLength(1)
    expect(notes[0].body).toMatch(/Gemaakt door NEXUS AI op .*\n\nTweede$/)
  })

  it('makes the review by itself once on Sunday evening', async () => {
    const fetchMock = vi.fn(async () => stream())
    vi.stubGlobal('fetch', fetchMock)
    const effects = { local: vi.fn(async () => {}), phones: vi.fn(async () => {}) }
    const token = async () => 'token'

    expect(await autoReviewTick(effects, sunday - 2 * 60 * 60_000, token)).toBe(false)
    expect(await autoReviewTick(effects, sunday, async () => null)).toBe(false)
    expect(await autoReviewTick(effects, sunday, token)).toBe(true)
    expect(effects.phones).toHaveBeenCalledWith('Weekoverzicht week 44', 'Drie deadlines op tijd af.', 'review:2026-10-26')
    expect(await autoReviewTick(effects, sunday + 60 * 60_000, token)).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // A review that another device made (its note synced here) is not made again.
    localStorage.clear()
    expect(await autoReviewTick(effects, sunday + 2 * 60 * 60_000, token)).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('can be turned off, and waits after a failure', async () => {
    const effects = { local: vi.fn(async () => {}), phones: vi.fn(async () => {}) }
    setAutoReview(false)
    expect(await autoReviewTick(effects, sunday, async () => 'token')).toBe(false)
    setAutoReview(true)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'NEXUS AI staat niet aan voor dit account.' }), { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await autoReviewTick(effects, sunday, async () => 'token')).toBe(false)
    expect(await autoReviewTick(effects, sunday + 10 * 60_000, async () => 'token')).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('takes the first real line for the notification', () => {
    expect(reviewTeaser('## Je week\n\n- Je haalde 4 van 5 deadlines.\n- Meer')).toBe('Je haalde 4 van 5 deadlines.')
    expect(reviewTeaser('')).toMatch(/Notities/)
  })
})
