import { describe, expect, it } from 'vitest'
import { dagstartWeatherLine, planWeather, parseForecast, parsePlaces, weatherLabel, weatherLine, weatherTip } from './weather'

const RAW = {
  timezone: 'Europe/Brussels',
  current: { time: 1_794_000_000, temperature_2m: 11.6, apparent_temperature: 9.2, weather_code: 61, wind_speed_10m: 18, precipitation: 0.4, is_day: 1 },
  hourly: { time: [1_794_000_000, 1_794_003_600], temperature_2m: [11.6, 12.1], precipitation_probability: [60, 40], weather_code: [61, 3] },
  daily: { time: [1_793_955_600], weather_code: [61], temperature_2m_max: [13.8], temperature_2m_min: [7.6], precipitation_probability_max: [70], sunrise: [1_793_983_000], sunset: [1_794_016_000] },
}

describe('weer', () => {
  it('makes the forecast small and safe', () => {
    const f = parseForecast(RAW)!
    expect(f.now).toMatchObject({ at: 1_794_000_000_000, temp: 11.6, feels: 9.2, code: 61, day: true })
    expect(f.hours).toHaveLength(2)
    expect(f.days[0]).toMatchObject({ max: 13.8, min: 7.6, rainChance: 70, sunrise: 1_793_983_000_000 })
    expect(parseForecast({ error: true, reason: 'x' })).toBeNull()
    expect(parseForecast(null)).toBeNull()
  })

  it('reads places', () => {
    const places = parsePlaces({ results: [
      { name: 'Antwerpen', latitude: 51.22, longitude: 4.4, admin1: 'Vlaanderen', country: 'België' },
      { name: 'Kapot', latitude: 'x', longitude: 4 },
    ] })
    expect(places).toEqual([{ name: 'Antwerpen', region: 'Vlaanderen, België', lat: 51.22, lon: 4.4 }])
    expect(parsePlaces({})).toEqual([])
  })

  it('says it in Dutch', () => {
    expect(weatherLabel(0).text).toBe('Zonnig')
    expect(weatherLabel(0, false).text).toBe('Helder')
    expect(weatherLabel(95).text).toBe('Onweer')
    const f = parseForecast(RAW)!
    expect(weatherLine('Antwerpen', f)).toBe('Antwerpen: 12° en lichte regen, vandaag 8° tot 14°, 70% kans op regen')
    expect(weatherTip(f)).toBe('Neem een paraplu mee.')
  })
})

describe('weer in de Dagstart', () => {
  it('gives the line of the right day only', () => {
    const f = parseForecast(RAW)!
    const day = f.days[0].at
    expect(dagstartWeatherLine('Antwerpen', f, day + 3600_000)).toBe('Weer in Antwerpen: 8° tot 14°, lichte regen, 70% kans op regen. Neem een paraplu mee.')
    expect(dagstartWeatherLine('Antwerpen', f, day + 2 * 86_400_000)).toBeNull()
    const dry = { ...f, days: [{ ...f.days[0], code: 0, rainChance: 5 }] }
    expect(dagstartWeatherLine('Gent', dry, day)).toBe('Weer in Gent: 8° tot 14°, zonnig.')
  })
})

describe('weer op het horloge', () => {
  it('sends a small, rounded summary', () => {
    const f = parseForecast(RAW)!
    expect(planWeather('Antwerpen', f, 99, f.days[0].at)).toEqual({ place: 'Antwerpen', temp: 12, min: 8, max: 14, rainChance: 70, label: 'Lichte regen', icon: '🌦️', at: 99 })
    expect(planWeather('Antwerpen', f, 99, f.days[0].at + 3 * 86_400_000)).toBeNull()
  })
})
