import { defaultProfilesState, type LifeItem } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { GET } from '../../../../api/agenda-feed'
import { AgendaFeed, feedError } from './feed'

const at = (d: number, h: number) => new Date(2026, 10, d, h).getTime()

/** A Supabase stand-in with one agenda_feeds row. */
function fakeClient() {
  let row: Record<string, unknown> | null = null
  const updates: string[] = []
  const chain = (result: () => unknown) => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'not']) c[m] = () => c
    c.maybeSingle = async () => ({ data: result(), error: null })
    c.single = async () => ({ data: result(), error: null })
    c.then = (ok: (v: unknown) => void) => ok({ data: result(), error: null })
    return c
  }
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'x' } } }) },
    from: () => ({
      select: () => chain(() => row),
      upsert: (value: Record<string, unknown>) => {
        row = { ...value, updated_at: new Date().toISOString() }
        return chain(() => row)
      },
      update: (value: { ics: string }) => {
        updates.push(value.ics)
        row = { ...row, ...value }
        return chain(() => null)
      },
      delete: () => {
        row = null
        return chain(() => null)
      },
    }),
  }
  return { client: client as unknown as SupabaseClient, updates, row: () => row }
}

describe('Agenda in Google', () => {
  const lessons = [{ start: at(26, 8), end: at(26, 10), subject: 'Wiskunde' }]
  let state = { ...defaultProfilesState(), calendarEvents: lessons }
  const sources = { profiles: () => state, items: () => [] as LifeItem[], now: () => at(25, 7) }

  it('makes a link with the lessons and only uploads again after a change', async () => {
    const { client, updates, row } = fakeClient()
    const feed = new AgendaFeed(client, sources)
    await feed.load()
    expect(feed.getSnapshot()).toMatchObject({ loaded: true, feed: null })
    expect(await feed.enable()).toBeNull()
    expect(feed.getSnapshot().feed?.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(String(row()?.ics)).toContain('SUMMARY:Wiskunde')
    await feed.push()
    expect(updates).toEqual([])
    state = { ...state, calendarEvents: [...lessons, { start: at(27, 8), end: at(27, 10), subject: 'Fysica' }] }
    await feed.push()
    expect(updates.length).toBe(1)
    expect(updates[0]).toContain('SUMMARY:Fysica')
    await feed.disable()
    expect(feed.getSnapshot().feed).toBeNull()
  })

  it('asks for the SQL step when the table is missing', () => {
    expect(feedError({ code: 'PGRST205', message: "Could not find the table 'public.agenda_feeds'" })).toBe('setup:supabase/migrations/20261125090000_agenda_feed.sql')
  })

  it('serves the calendar only for a valid code', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      new Response(JSON.stringify(JSON.parse(String(init.body)).p_token.startsWith('a') ? 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n' : null)),
    )
    vi.stubGlobal('fetch', fetchMock)
    const ok = await GET(new Request(`https://nexus.test/api/agenda-feed?t=${'a'.repeat(43)}`))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toContain('text/calendar')
    expect(await ok.text()).toContain('BEGIN:VCALENDAR')
    expect((await GET(new Request(`https://nexus.test/api/agenda-feed?t=${'b'.repeat(43)}`))).status).toBe(404)
    expect((await GET(new Request('https://nexus.test/api/agenda-feed?t=kort'))).status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
})
