import { describe, expect, it } from 'vitest'
import { calendarUrl, googleCalendarUrl, nextCalendarEvent, parseIcs } from './calendar'

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

  it('accepts only the iCal address of Google Agenda', () => {
    const link = 'https://calendar.google.com/calendar/ical/me%40gmail.com/private-abc/basic.ics'
    expect(googleCalendarUrl(` ${link} `)).toBe(link)
    expect(googleCalendarUrl('https://calendar.google.com/calendar/embed?src=me')).toBeNull()
    expect(googleCalendarUrl('https://apih.ap.be/ical/x.ics')).toBeNull()
  })
})

const vevent = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']
const cal = (...events: string[][]) => ['BEGIN:VCALENDAR', ...events.flat(), 'END:VCALENDAR'].join('\r\n')

describe('repeating events', () => {
  it('repeats weekly on several days, in local time across the change to winter time', () => {
    const ics = cal(vevent('UID:sport', 'BEGIN:VALARM', 'SUMMARY:Herinnering', 'END:VALARM', 'DTSTART;TZID=Europe/Brussels:20261020T190000', 'DTEND;TZID=Europe/Brussels:20261020T200000', 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=4', 'SUMMARY:Sport'))
    const starts = parseIcs(ics, from, to).map((e) => e.start)
    expect(parseIcs(ics, from, to)[0].subject).toBe('Sport')
    expect(starts).toEqual(['2026-10-20T19:00:00+02:00', '2026-10-22T19:00:00+02:00', '2026-10-27T19:00:00+01:00', '2026-10-29T19:00:00+01:00'].map(Date.parse))
  })

  it('skips EXDATE, moves a RECURRENCE-ID, drops cancelled times and stops at UNTIL', () => {
    const ics = cal(
      vevent('UID:a', 'DTSTART:20261019T080000Z', 'DTEND:20261019T090000Z', 'RRULE:FREQ=DAILY;UNTIL=20261023T235959Z', 'EXDATE:20261020T080000Z', 'SUMMARY:Lopen'),
      vevent('UID:a', 'RECURRENCE-ID:20261021T080000Z', 'DTSTART:20261021T100000Z', 'DTEND:20261021T110000Z', 'SUMMARY:Lopen (later)'),
      vevent('UID:a', 'RECURRENCE-ID:20261022T080000Z', 'DTSTART:20261022T080000Z', 'DTEND:20261022T090000Z', 'STATUS:CANCELLED', 'SUMMARY:Lopen'),
    )
    expect(parseIcs(ics, from, to).map((e) => [e.subject, new Date(e.start).toISOString()])).toEqual([
      ['Lopen', '2026-10-19T08:00:00.000Z'],
      ['Lopen (later)', '2026-10-21T10:00:00.000Z'],
      ['Lopen', '2026-10-23T08:00:00.000Z'],
    ])
  })

  it('repeats monthly on the same date and keeps only the requested period', () => {
    const ics = cal(vevent('UID:m', 'DTSTART:20260131T120000Z', 'DTEND:20260131T130000Z', 'RRULE:FREQ=MONTHLY;INTERVAL=1', 'SUMMARY:Huur'))
    // February, April, June and September have no 31st.
    expect(parseIcs(ics, Date.parse('2026-01-01T00:00:00Z'), Date.parse('2026-09-01T00:00:00Z')).map((e) => new Date(e.start).toISOString().slice(5, 10))).toEqual([
      '01-31',
      '03-31',
      '05-31',
      '07-31',
      '08-31',
    ])
  })
})
