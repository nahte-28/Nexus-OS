// Weer: a forecast from Open-Meteo (free, no key), fetched through /api/weather. Pure logic.

export interface WeatherPlace {
  name: string
  /** Province or country, to tell places with the same name apart. */
  region: string
  lat: number
  lon: number
}

export interface WeatherNow {
  at: number
  temp: number
  feels: number
  code: number
  wind: number
  rain: number
  day: boolean
}

export interface WeatherHour {
  at: number
  temp: number
  rainChance: number
  code: number
}

export interface WeatherDay {
  /** Midnight of that day, as Open-Meteo gives it (unix ms). */
  at: number
  code: number
  max: number
  min: number
  rainChance: number
  sunrise: number
  sunset: number
}

export interface Forecast {
  timezone: string
  now: WeatherNow
  hours: WeatherHour[]
  days: WeatherDay[]
}

export function validCoords(lat: unknown, lon: unknown): lat is number {
  return typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}

const n = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Open-Meteo's answer made small and safe; null when it is not a forecast. */
export function parseForecast(raw: unknown): Forecast | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, Record<string, unknown> | string | undefined>
  const c = o.current as Record<string, unknown> | undefined
  const h = (o.hourly ?? {}) as Record<string, unknown>
  const d = (o.daily ?? {}) as Record<string, unknown>
  if (!c || typeof c.temperature_2m !== 'number') return null
  const ms = (s: unknown) => n(s) * 1000
  const hours = arr(h.time).slice(0, 48).map((t, i) => ({
    at: ms(t),
    temp: n(arr(h.temperature_2m)[i]),
    rainChance: n(arr(h.precipitation_probability)[i]),
    code: n(arr(h.weather_code)[i]),
  }))
  const days = arr(d.time).slice(0, 16).map((t, i) => ({
    at: ms(t),
    code: n(arr(d.weather_code)[i]),
    max: n(arr(d.temperature_2m_max)[i]),
    min: n(arr(d.temperature_2m_min)[i]),
    rainChance: n(arr(d.precipitation_probability_max)[i]),
    sunrise: ms(arr(d.sunrise)[i]),
    sunset: ms(arr(d.sunset)[i]),
  }))
  return {
    timezone: typeof o.timezone === 'string' && o.timezone.length < 60 ? o.timezone : 'UTC',
    now: { at: ms(c.time), temp: c.temperature_2m, feels: n(c.apparent_temperature, c.temperature_2m), code: n(c.weather_code), wind: n(c.wind_speed_10m), rain: n(c.precipitation), day: c.is_day !== 0 },
    hours,
    days,
  }
}

/** Open-Meteo's place search made small; at most 5. */
export function parsePlaces(raw: unknown): WeatherPlace[] {
  const list = arr((raw as { results?: unknown } | null)?.results)
  return list.flatMap((r) => {
    const o = r as Record<string, unknown>
    if (typeof o?.name !== 'string' || !validCoords(o.latitude, o.longitude)) return []
    const region = [o.admin1, o.country].filter((x): x is string => typeof x === 'string' && x !== '').join(', ')
    return [{ name: o.name.slice(0, 80), region: region.slice(0, 120), lat: o.latitude as number, lon: o.longitude as number }]
  }).slice(0, 5)
}

/** WMO weather codes in Dutch, with an emoji for the screen. */
export function weatherLabel(code: number, day = true): { text: string; icon: string } {
  if (code === 0) return { text: day ? 'Zonnig' : 'Helder', icon: day ? '☀️' : '🌙' }
  if (code === 1) return { text: 'Overwegend helder', icon: day ? '🌤️' : '🌙' }
  if (code === 2) return { text: 'Half bewolkt', icon: '⛅' }
  if (code === 3) return { text: 'Bewolkt', icon: '☁️' }
  if (code === 45 || code === 48) return { text: 'Mist', icon: '🌫️' }
  if (code >= 51 && code <= 57) return { text: 'Motregen', icon: '🌦️' }
  if (code === 61 || code === 80) return { text: 'Lichte regen', icon: '🌦️' }
  if (code === 63 || code === 81) return { text: 'Regen', icon: '🌧️' }
  if (code === 65 || code === 82) return { text: 'Zware regen', icon: '🌧️' }
  if (code === 66 || code === 67) return { text: 'IJzel', icon: '🧊' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { text: 'Sneeuw', icon: '🌨️' }
  if (code >= 95) return { text: 'Onweer', icon: '⛈️' }
  return { text: 'Onbekend', icon: '🌡️' }
}

/** One line for a notice or the Dagstart, like "Antwerpen: 12° en lichte regen, vandaag 8° tot 14°, 60% kans op regen". */
export function weatherLine(place: string, f: Forecast): string {
  const today = f.days[0]
  const now = `${Math.round(f.now.temp)}° en ${weatherLabel(f.now.code, f.now.day).text.toLowerCase()}`
  if (!today) return `${place}: ${now}`
  return `${place}: ${now}, vandaag ${Math.round(today.min)}° tot ${Math.round(today.max)}°, ${Math.round(today.rainChance)}% kans op regen`
}

/** A tip when it matters: an umbrella, a coat or sun cream. */
export function weatherTip(f: Forecast): string | null {
  const today = f.days[0]
  if (!today) return null
  if (today.rainChance >= 50) return 'Neem een paraplu mee.'
  if (today.min <= 2) return 'Het vriest misschien: kleed je warm.'
  if (today.max >= 27) return 'Warm vandaag: drink genoeg water.'
  return null
}

/** How long a fetched forecast counts as fresh. */
export const WEATHER_FRESH_MS = 30 * 60_000
export const MAX_WEATHER_PLACES = 6
