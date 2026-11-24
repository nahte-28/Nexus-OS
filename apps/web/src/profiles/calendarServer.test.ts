import { describe, expect, it, vi } from 'vitest'
import { allowedUrl, fetchCalendar, privateAddress, publicUrl, trimPast } from '../../../../api/calendar'

describe('calendar server links', () => {
  it('takes any public https calendar, webcal included', () => {
    expect(publicUrl('webcal://p01-caldav.icloud.com/published/2/abc')).toBe('https://p01-caldav.icloud.com/published/2/abc')
    expect(publicUrl('https://outlook.office365.com/owa/calendar/x/y/calendar.ics')).toBe('https://outlook.office365.com/owa/calendar/x/y/calendar.ics')
  })

  it('refuses plain http, ports, logins, IP addresses and local names', () => {
    for (const bad of ['http://a.example/x.ics', 'https://a.example:8443/x.ics', 'https://u:p@a.example/x.ics', 'https://10.0.0.1/x.ics', 'https://[::1]/x.ics', 'https://localhost/x.ics', 'https://router.lan/x.ics', 'https://intranet/x.ics', 'https://calendar.google.com/calendar/embed?src=x'])
      expect(publicUrl(bad)).toBeNull()
  })

  it('knows which addresses are private', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.0.5', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) expect(privateAddress(ip)).toBe(true)
    for (const ip of ['8.8.8.8', '172.32.0.1', '2a00:1450:4001::1']) expect(privateAddress(ip)).toBe(false)
  })

  it('still reads the school and Google links as before', () => {
    expect(allowedUrl('https://apih.ap.be/ical/x.ics', ['apih.ap.be'])).toBe('https://apih.ap.be/ical/x.ics')
  })

  it('follows redirects, checking every next address', async () => {
    const ics = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR'
    const doFetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('p01') ? new Response(null, { status: 301, headers: { location: 'https://p42-caldav.icloud.com/published/2/abc' } }) : new Response(ics),
    ) as unknown as typeof fetch
    const outside = vi.fn(async () => true)
    expect(await fetchCalendar('https://p01-caldav.icloud.com/published/2/abc', true, doFetch, outside)).toBe(ics)
    expect(outside).toHaveBeenCalledTimes(2)
    const toLan = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://10.0.0.1/x.ics' } })) as unknown as typeof fetch
    expect(await fetchCalendar('https://club.example.be/a.ics', true, toLan, outside)).toMatchObject({ error: expect.stringMatching(/niet mag openen/) })
    const intoPrivate = vi.fn(async (u: string) => !u.includes('evil'))
    const toEvil = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/x.ics' } })) as unknown as typeof fetch
    expect(await fetchCalendar('https://club.example.be/a.ics', true, toEvil, intoPrivate)).toMatchObject({ status: 400 })
    const loop = vi.fn(async () => new Response(null, { status: 302, headers: { location: '/again.ics' } })) as unknown as typeof fetch
    expect(await fetchCalendar('https://club.example.be/a.ics', true, loop, outside)).toMatchObject({ error: expect.stringMatching(/te vaak/) })
  })

  it('says what went wrong when the calendar fails', async () => {
    const outside = async () => true
    const notFound = vi.fn(async () => new Response('nee', { status: 404 })) as unknown as typeof fetch
    expect(await fetchCalendar('https://club.example.be/a.ics', true, notFound, outside)).toMatchObject({ error: expect.stringMatching(/fout \(404\)/) })
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    expect(await fetchCalendar('https://club.example.be/a.ics', false, down, outside)).toMatchObject({ error: expect.stringMatching(/reageert niet/) })
  })
})

describe('big calendars', () => {
  const ev = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n')
  const cutoff = Date.parse('2026-11-21T00:00:00Z')

  it('leaves out what is over, keeps what is coming, open series and recently moved occurrences', () => {
    const old = ev('UID:old', 'DTSTART:20200101T100000Z', 'DTEND:20200101T110000Z', 'SUMMARY:Oud')
    const allDayOld = ev('UID:d', 'DTSTART;VALUE=DATE:20190101', 'DTEND;VALUE=DATE:20190102', 'SUMMARY:Oud')
    const coming = ev('UID:new', 'DTSTART;TZID=Europe/Brussels:20261125T100000', 'DTEND;TZID=Europe/Brussels:20261125T110000', 'SUMMARY:Nieuw')
    const series = ev('UID:s', 'DTSTART:20180101T100000Z', 'DTEND:20180101T110000Z', 'RRULE:FREQ=WEEKLY', 'SUMMARY:Les')
    const ended = ev('UID:e', 'DTSTART:20180101T100000Z', 'DTEND:20180101T110000Z', 'RRULE:FREQ=WEEKLY;UNTIL=20190101T000000Z', 'SUMMARY:Gedaan')
    const movedBack = ev('UID:s', 'RECURRENCE-ID:20261126T100000Z', 'DTSTART:20200101T100000Z', 'DTEND:20200101T110000Z', 'SUMMARY:Les')
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VTIMEZONE', 'TZID:Europe/Brussels', 'END:VTIMEZONE', old, allDayOld, coming, series, ended, movedBack, 'END:VCALENDAR'].join('\r\n')
    const out = trimPast(ics, cutoff)
    expect(out).toContain('BEGIN:VTIMEZONE')
    expect(out).not.toContain('UID:old')
    expect(out).not.toContain('UID:d')
    expect(out).not.toContain('UID:e')
    expect(out).toContain('UID:new')
    expect(out).toContain('RRULE:FREQ=WEEKLY\r\n')
    expect(out).toContain('RECURRENCE-ID:20261126T100000Z')
    expect(out.endsWith('END:VCALENDAR')).toBe(true)
  })
})
