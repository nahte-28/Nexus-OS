import { describe, expect, it, vi } from 'vitest'
import { allowedUrl, fetchCalendar, privateAddress, publicUrl } from '../../../../api/calendar'

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
