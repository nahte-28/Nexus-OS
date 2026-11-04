import { describe, expect, it, vi } from 'vitest'
import { defaultProfilesState, linkedEvents } from '@nexus/core'
import { removeExtra, syncCalendar, syncExtra, syncGoogle } from './calendar'
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

describe('other calendars', () => {
  const deps = (body = ICS) => ({ fetch: vi.fn(async () => new Response(body.replace('Networking', 'Training'))), token: async () => 'token', now: () => NOW })

  it('adds a calendar with its name, refreshes it in place and unlinks it', async () => {
    const store = new ProfilesStore(() => NOW, defaultProfilesState())
    const d = deps()
    expect(await syncExtra('webcal://club.example.be/agenda.ics', 'Voetbal', 'c1', store, d)).toBeNull()
    expect(d.fetch).toHaveBeenCalledWith('/api/calendar', expect.objectContaining({ body: JSON.stringify({ url: 'https://club.example.be/agenda.ics' }) }))
    let { state } = store.getSnapshot()
    expect(state.extraCalendars).toEqual([{ id: 'c1', name: 'Voetbal', url: 'https://club.example.be/agenda.ics' }])
    expect(linkedEvents(state)).toEqual([expect.objectContaining({ subject: 'Training', room: 'Voetbal' })])
    expect(await syncExtra('https://club.example.be/agenda.ics', 'Voetbal', 'c1', store, d)).toBeNull()
    expect(store.getSnapshot().state.extraCalendars).toHaveLength(1)
    expect(await syncExtra('https://club.example.be/agenda.ics', 'Nog eens', 'c2', store, d)).toMatch(/al gekoppeld/)
    removeExtra('c1', store)
    ;({ state } = store.getSnapshot())
    expect(state.extraCalendars).toEqual([])
    expect(state.extraEvents).toEqual({})
  })

  it('refuses local and IP addresses before asking the server', async () => {
    const store = new ProfilesStore(() => NOW, defaultProfilesState())
    const d = deps()
    for (const bad of ['http://club.example.be/a.ics', 'https://192.168.1.10/a.ics', 'https://localhost/a.ics', 'https://nas.local/a.ics', 'https://user:pw@club.example.be/a.ics'])
      expect(await syncExtra(bad, 'x', 'c1', store, d)).toMatch(/geen agendalink/)
    expect(d.fetch).not.toHaveBeenCalled()
  })
})
