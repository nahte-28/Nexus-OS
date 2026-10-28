import { describe, expect, it, vi } from 'vitest'
import { defaultProfilesState } from '@nexus/core'
import { syncCalendar, syncGoogle } from './calendar'
import { ProfilesStore } from './store'

const NOW = Date.parse('2026-10-20T07:00:00Z')
const ICS = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;TZID=Europe/Brussels:20261020T083000\r\nDTEND;TZID=Europe/Brussels:20261020T101500\r\nSUMMARY:Networking\r\nEND:VEVENT\r\nEND:VCALENDAR'
const LINK = 'https://apih.ap.be/ical/student.ics'

describe('school calendar sync', () => {
  it('stores the lessons from the calendar link', async () => {
    const store = new ProfilesStore(() => NOW, defaultProfilesState())
    const fetch = vi.fn(async () => new Response(ICS))
    const error = await syncCalendar(LINK, store, { fetch, token: async () => 'token', now: () => NOW })
    expect(error).toBeNull()
    expect(fetch).toHaveBeenCalledWith('/api/calendar', expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: LINK }) }))
    const { state } = store.getSnapshot()
    expect(state.calendarUrl).toBe(LINK)
    expect(state.calendarEvents).toEqual([{ start: Date.parse('2026-10-20T08:30:00+02:00'), end: Date.parse('2026-10-20T10:15:00+02:00'), subject: 'Networking' }])
  })

  it('explains what is wrong without touching the stored lessons', async () => {
    const store = new ProfilesStore(() => NOW, defaultProfilesState())
    const deps = { fetch: vi.fn(), token: async () => 'token', now: () => NOW }
    expect(await syncCalendar('https://example.com/x.ics', store, deps)).toMatch(/geen agendalink/)
    expect(await syncCalendar(LINK, store, { ...deps, token: async () => null })).toMatch(/Meld je aan/)
    const failing = { ...deps, fetch: vi.fn(async () => Response.json({ error: 'De agenda gaf een fout (404).' }, { status: 502 })) }
    expect(await syncCalendar(LINK, store, failing)).toBe('De agenda gaf een fout (404).')
    expect(deps.fetch).not.toHaveBeenCalled()
    expect(store.getSnapshot().state.calendarEvents).toEqual([])
  })

  it('stores a Google Agenda next to the lessons, and refuses other links', async () => {
    const store = new ProfilesStore(() => NOW, defaultProfilesState())
    const google = 'https://calendar.google.com/calendar/ical/me%40gmail.com/private-abc/basic.ics'
    const fetch = vi.fn(async () => new Response(ICS.replace('Networking', 'Tandarts')))
    const deps = { fetch, token: async () => 'token', now: () => NOW }
    expect(await syncGoogle(LINK, store, deps)).toMatch(/geen iCal-adres/)
    expect(await syncGoogle('https://calendar.google.com/calendar/embed?src=x', store, deps)).toMatch(/geen iCal-adres/)
    expect(await syncGoogle(google, store, deps)).toBeNull()
    const { state } = store.getSnapshot()
    expect(state).toMatchObject({ googleUrl: google, googleSyncedAt: NOW, calendarEvents: [] })
    expect(state.googleEvents.map((e) => e.subject)).toEqual(['Tandarts'])
  })
})
