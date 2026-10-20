import { describe, expect, it } from 'vitest'
import { calendarUrl, nextCalendarEvent, parseIcs } from './calendar'

const ics = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Brussels:20261020T083000',
  'DTEND;TZID=Europe/Brussels:20261020T101500',
  'SUMMARY:Networking',
  'LOCATION:B204\\, Ellermanstraat',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20261103T090000',
  'DTEND:20261103T110000',
  'SUMMARY:Wiskunde (winter',
  ' tijd)', // a folded line: the leading space is dropped
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20261021T120000Z',
  'DTEND:20261021T130000Z',
  'SUMMARY:Engels',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261022',
  'SUMMARY:Vrije dag',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

const from = Date.parse('2026-10-19T00:00:00Z')
const to = Date.parse('2026-11-30T00:00:00Z')

describe('school calendar', () => {
  it('reads timed lessons in school time, across summer and winter time', () => {
    const events = parseIcs(ics, from, to)
    expect(events.map((e) => e.subject)).toEqual(['Networking', 'Engels', 'Wiskunde (wintertijd)'])
    expect(events[0]).toMatchObject({ start: Date.parse('2026-10-20T08:30:00+02:00'), room: 'B204, Ellermanstraat' })
    expect(events[2].start).toBe(Date.parse('2026-11-03T09:00:00+01:00'))
    expect(events[1].end).toBe(Date.parse('2026-10-21T13:00:00Z'))
  })

  it('keeps only the requested period', () => {
    expect(parseIcs(ics, Date.parse('2026-10-21T00:00:00Z'), Date.parse('2026-10-22T00:00:00Z')).map((e) => e.subject)).toEqual(['Engels'])
  })

  it('finds the running or next lesson', () => {
    const events = parseIcs(ics, from, to)
    expect(nextCalendarEvent(events, Date.parse('2026-10-20T09:00:00+02:00'))?.subject).toBe('Networking')
    expect(nextCalendarEvent(events, Date.parse('2026-10-20T11:00:00+02:00'))?.subject).toBe('Engels')
    expect(nextCalendarEvent(events, Date.parse('2026-12-01T00:00:00Z'))).toBeNull()
  })

  it('only accepts https links on the school host', () => {
    expect(calendarUrl(' https://apih.ap.be/ical/abc.ics ')).toBe('https://apih.ap.be/ical/abc.ics')
    expect(calendarUrl('webcal://apih.ap.be/ical/abc.ics')).toBe('https://apih.ap.be/ical/abc.ics')
    expect(calendarUrl('http://apih.ap.be/x')).toBeNull()
    expect(calendarUrl('https://example.com/x.ics')).toBeNull()
    expect(calendarUrl('https://user:pw@apih.ap.be/x')).toBeNull()
    expect(calendarUrl('geen link')).toBeNull()
  })
})
