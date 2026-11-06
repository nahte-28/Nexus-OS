import { describe, expect, it, vi } from 'vitest'
import { forecastUrl, handleWeather, searchUrl } from '../../../../api/weather'

const post = (body: unknown) => new Request('https://nexus.test/api/weather', { method: 'POST', body: JSON.stringify(body) })

describe('/api/weather', () => {
  it('only asks the two Open-Meteo addresses, with rounded coordinates', () => {
    const url = new URL(forecastUrl(51.219876, 4.402561)!)
    expect(url.origin).toBe('https://api.open-meteo.com')
    expect(url.searchParams.get('latitude')).toBe('51.22')
    expect(url.searchParams.get('longitude')).toBe('4.40')
    expect(forecastUrl(91, 0)).toBeNull()
    expect(forecastUrl('51', 4)).toBeNull()
    expect(new URL(searchUrl(' Antwerpen ')!).searchParams.get('name')).toBe('Antwerpen')
    expect(searchUrl('a')).toBeNull()
  })

  it('passes the answer on and turns failures into Dutch', async () => {
    const ok = vi.fn(async () => new Response('{"results":[]}', { status: 200 }))
    const res = await handleWeather(post({ q: 'Gent' }), ok as unknown as typeof fetch)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"results":[]}')
    expect(String((ok.mock.calls[0] as unknown[])[0])).toContain('geocoding-api.open-meteo.com')

    const bad = await handleWeather(post({ lat: 'x' }), ok as unknown as typeof fetch)
    expect(bad.status).toBe(400)
    const down = await handleWeather(post({ lat: 51, lon: 4 }), (async () => { throw new Error('offline') }) as unknown as typeof fetch)
    expect(down.status).toBe(502)
    expect((await down.json()).error).toContain('weerdienst')
  })
})
