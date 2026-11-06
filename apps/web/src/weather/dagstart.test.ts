import { afterEach, describe, expect, it } from 'vitest'
import { parseForecast } from '@nexus/core'
import { dagstartExtra } from '../briefing/store'
import { setFeature } from '../features/store'
import { weatherForDagstart, weatherStore } from './store'

const day = new Date(2026, 10, 6).getTime()
const forecast = parseForecast({
  timezone: 'Europe/Brussels',
  current: { time: day / 1000, temperature_2m: 9, weather_code: 3, is_day: 1 },
  daily: { time: [day / 1000], weather_code: [63], temperature_2m_max: [12.4], temperature_2m_min: [6.6], precipitation_probability_max: [80], sunrise: [0], sunset: [0] },
})!
const place = { name: 'Antwerpen', region: '', lat: 51.22, lon: 4.4 }

describe('weer in de Dagstart', () => {
  afterEach(() => {
    weatherStore.update(() => ({ places: [], selected: 0, cache: {}, inDagstart: true }))
    setFeature('weather', true)
  })

  it('puts the first place in the Dagstart, unless you switch it off', () => {
    const now = Date.now()
    weatherStore.update(() => ({ places: [place], selected: 0, cache: { '51.22,4.40': { at: now - 3_600_000, forecast } }, inDagstart: true }))
    const line = 'Weer in Antwerpen: 7° tot 12°, regen, 80% kans op regen. Neem een paraplu mee.'
    expect(weatherForDagstart(day, now)).toBe(line)
    expect(weatherForDagstart(day, now + 13 * 3_600_000)).toBeNull()
    setFeature('weather', true)
    expect(dagstartExtra()!(day, now)[0]).toBe(line)
    setFeature('weather', false)
    expect((dagstartExtra()?.(day, now) ?? []).includes(line)).toBe(false)
    setFeature('weather', true)
    weatherStore.update((s) => ({ ...s, inDagstart: false }))
    expect(weatherForDagstart(day, now)).toBeNull()
  })
})
