import { describe, expect, it } from 'vitest'
import { alreadyLinked, buildAgendaFeed, DEFAULT_FEED_OPTIONS, feedEvents, feedUrl, FEED_TOKEN, foldLine, icsText, keepPast, newFeedToken, type AgendaFeedInput } from './agendaFeed'
import type { Appointment, Deadline } from './life'

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const now = at(2026, 11, 25, 7)
const empty: AgendaFeedInput = { calendarEvents: [], timetable: [], items: [], linked: [] }

const appointment = (over: Partial<Appointment> = {}): Appointment => ({
  id: 'a1',
  kind: 'appointment',
  title: 'Tandarts',
  startAt: at(2026, 11, 27, 14),
  endAt: at(2026, 11, 27, 15),
  location: 'Antwerpen',
  notes: '',
  remind: [],
  target: 'this_device',
  updatedAt: 1,
  deletedAt: null,
  ...over,
})

describe('agenda feed for Google', () => {
  it('writes the school lessons with place and a stable id', () => {
    const ics = buildAgendaFeed({ ...empty, calendarEvents: [{ start: at(2026, 11, 26, 8, 30), end: at(2026, 11, 26, 10, 30), subject: 'Wiskunde', room: 'B12' }] }, DEFAULT_FEED_OPTIONS, now)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('SUMMARY:Wiskunde\r\n')
    expect(ics).toContain('LOCATION:B12\r\n')
    expect(ics).toContain(`DTSTART:${new Date(at(2026, 11, 26, 8, 30)).toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`)
    expect(ics).toMatch(/UID:les-\d{8}T\d{6}Z-wiskunde@nexus-os/)
    // Exactly the same on every device and every run.
    expect(buildAgendaFeed({ ...empty, calendarEvents: [{ start: at(2026, 11, 26, 8, 30), end: at(2026, 11, 26, 10, 30), subject: 'Wiskunde', room: 'B12' }] }, DEFAULT_FEED_OPTIONS, now)).toBe(ics)
  })

  it('leaves out what is already in Google Agenda', () => {
    const lessons = [
      { start: at(2026, 11, 26, 8, 30), end: at(2026, 11, 26, 10, 30), subject: 'Wiskunde' },
      { start: at(2026, 11, 26, 13), end: at(2026, 11, 26, 15), subject: 'Fysica' },
    ]
    const linked = [{ start: at(2026, 11, 26, 8, 30), end: at(2026, 11, 26, 10, 30), subject: 'Les wiskunde B12' }]
    const events = feedEvents({ ...empty, calendarEvents: lessons, linked }, DEFAULT_FEED_OPTIONS, now)
    expect(events.map((e) => e.title)).toEqual(['Fysica'])
    expect(alreadyLinked({ start: at(2026, 11, 26, 13), end: at(2026, 11, 26, 14), title: 'Fysica' }, [{ start: at(2026, 11, 26, 13), end: at(2026, 11, 26, 15), subject: 'fysica' }])).toBe(true)
    expect(alreadyLinked({ start: at(2026, 11, 26, 13), end: at(2026, 11, 26, 14), title: 'Fysica' }, [{ start: at(2026, 11, 26, 13), end: at(2026, 11, 26, 15), subject: 'Sport' }])).toBe(false)
  })

  it('writes the typed-in timetable week after week when there is no school calendar', () => {
    const events = feedEvents({ ...empty, timetable: [{ id: 'l1', day: 4, start: '08:30', end: '10:00', subject: 'Chemie' }] }, DEFAULT_FEED_OPTIONS, now)
    expect(events.length).toBe(26)
    expect(new Date(events[0].start).getDay()).toBe(4)
    expect(new Date(events[0].start).getHours()).toBe(8)
    expect(events[0].uid).toBe('rooster-l1-2026-11-26@nexus-os')
  })

  it('adds NEXUS appointments, series included, and deadlines only when asked', () => {
    const weekly = appointment({ id: 'a2', title: 'Training', repeat: { freq: 'weekly', interval: 1, days: [], until: '2026-12-11', except: [] } })
    const deadline: Deadline = { id: 'd1', kind: 'deadline', title: 'Verslag', dueAt: at(2026, 11, 28, 23, 59), projectId: null, notes: '', doneAt: null, remind: [], target: 'this_device', updatedAt: 1, deletedAt: null }
    const input = { ...empty, items: [appointment(), weekly, deadline] }
    const titles = feedEvents(input, DEFAULT_FEED_OPTIONS, now).map((e) => e.title)
    expect(titles.filter((t) => t === 'Training').length).toBe(3)
    expect(titles).toContain('Tandarts')
    expect(titles).not.toContain('Deadline: Verslag')
    expect(feedEvents(input, { appointments: false, deadlines: true }, now).map((e) => e.title)).toEqual(['Deadline: Verslag'])
  })

  it('keeps lessons that are over from the previous feed', () => {
    const lesson = { start: at(2026, 11, 20, 8, 30), end: at(2026, 11, 20, 10), subject: 'Geschiedenis' }
    const before = buildAgendaFeed({ ...empty, calendarEvents: [lesson] }, DEFAULT_FEED_OPTIONS, at(2026, 11, 20, 7))
    const after = buildAgendaFeed(empty, DEFAULT_FEED_OPTIONS, now, before)
    expect(after).toContain('SUMMARY:Geschiedenis')
    expect(keepPast(before, now + 100 * 24 * 60 * 60_000, new Set())).toEqual([])
    expect(after.match(/BEGIN:VEVENT/g)?.length).toBe(1)
  })

  it('escapes text and folds long lines', () => {
    expect(icsText('Les; groep A, B\nlokaal\\1')).toBe('Les\\; groep A\\, B\\nlokaal\\\\1')
    const long = `SUMMARY:${'é'.repeat(60)}`
    const folded = foldLine(long)
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(long)
  })

  it('makes a secret link', () => {
    const token = newFeedToken()
    expect(FEED_TOKEN.test(token)).toBe(true)
    expect(token).not.toBe(newFeedToken())
    expect(feedUrl('https://nexus-os-lime.vercel.app/', token)).toBe(`https://nexus-os-lime.vercel.app/api/agenda-feed?t=${token}`)
  })
})
