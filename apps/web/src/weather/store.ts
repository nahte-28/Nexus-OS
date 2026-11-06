import { dagstartWeatherLine, MAX_WEATHER_PLACES, parseForecast, parsePlaces, validCoords, WEATHER_FRESH_MS, type Forecast, type WeatherPlace } from '@nexus/core'
import { apiBase } from '../platform/desktop'
import { readStorage, writeStorage } from '../state/storage'

/** Weer on this device (localStorage nexus.weather): your places and the last forecast of each. */
export interface WeatherState {
  places: WeatherPlace[]
  selected: number
  cache: Record<string, { at: number; forecast: Forecast }>
  /** Whether the first place's weather goes in the Dagstart and the Dagbriefing. */
  inDagstart: boolean
}

const KEY = 'nexus.weather'
export const placeKey = (p: Pick<WeatherPlace, 'lat' | 'lon'>) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`
const EMPTY: WeatherState = { places: [], selected: 0, cache: {}, inDagstart: true }

export function parseWeatherState(raw: string | null): WeatherState {
  try {
    const o = JSON.parse(raw ?? '') as Partial<WeatherState>
    const places = (Array.isArray(o.places) ? o.places : [])
      .filter((p): p is WeatherPlace => typeof p?.name === 'string' && typeof p.region === 'string' && validCoords(p.lat, p.lon))
      .slice(0, MAX_WEATHER_PLACES)
    const cache: WeatherState['cache'] = {}
    for (const p of places) {
      const c = o.cache?.[placeKey(p)]
      const forecast = c && typeof c.at === 'number' ? parseForecast(toRaw(c.forecast)) : null
      if (c && forecast) cache[placeKey(p)] = { at: c.at, forecast }
    }
    const selected = typeof o.selected === 'number' && o.selected >= 0 && o.selected < places.length ? o.selected : 0
    return { places, selected, cache, inDagstart: o.inDagstart !== false }
  } catch {
    return EMPTY
  }
}

/** A stored Forecast back into the shape parseForecast checks, so stored data is checked too. */
function toRaw(f: Forecast | undefined): unknown {
  if (!f?.now) return null
  const s = (ms: number) => ms / 1000
  return {
    timezone: f.timezone,
    current: { time: s(f.now.at), temperature_2m: f.now.temp, apparent_temperature: f.now.feels, weather_code: f.now.code, wind_speed_10m: f.now.wind, precipitation: f.now.rain, is_day: f.now.day ? 1 : 0 },
    hourly: { time: (f.hours ?? []).map((h) => s(h.at)), temperature_2m: f.hours.map((h) => h.temp), precipitation_probability: f.hours.map((h) => h.rainChance), weather_code: f.hours.map((h) => h.code) },
    daily: {
      time: (f.days ?? []).map((d) => s(d.at)), weather_code: f.days.map((d) => d.code), temperature_2m_max: f.days.map((d) => d.max), temperature_2m_min: f.days.map((d) => d.min),
      precipitation_probability_max: f.days.map((d) => d.rainChance), sunrise: f.days.map((d) => s(d.sunrise)), sunset: f.days.map((d) => s(d.sunset)),
    },
  }
}

let state = parseWeatherState(readStorage(KEY))
const listeners = new Set<() => void>()

export const weatherStore = {
  subscribe(l: () => void): () => void {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  getSnapshot: (): WeatherState => state,
  update(fn: (s: WeatherState) => WeatherState): void {
    state = fn(state)
    writeStorage(KEY, JSON.stringify(state))
    listeners.forEach((l) => l())
  },
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>

async function ask(body: object, doFetch: Fetch): Promise<unknown> {
  let response: Response
  try {
    response = await doFetch(`${apiBase}/api/weather`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new Error('Geen verbinding. Je ziet het laatst opgehaalde weer.')
  }
  const data = (await response.json().catch(() => null)) as { error?: string } | null
  if (!response.ok) throw new Error(data?.error ?? `Weer ophalen mislukt (${response.status}).`)
  return data
}

/** Places matching [q], via Open-Meteo. */
export async function searchPlaces(q: string, doFetch: Fetch = (u, i) => fetch(u, i)): Promise<WeatherPlace[]> {
  return parsePlaces(await ask({ q }, doFetch))
}

/** The forecast for [place], fetched again only when the stored one is older than 30 minutes (or [force]). */
export async function refreshForecast(place: WeatherPlace, force = false, doFetch: Fetch = (u, i) => fetch(u, i), now = Date.now()): Promise<Forecast> {
  const key = placeKey(place)
  const cached = state.cache[key]
  if (!force && cached && now - cached.at < WEATHER_FRESH_MS) return cached.forecast
  const forecast = parseForecast(await ask({ lat: place.lat, lon: place.lon }, doFetch))
  if (!forecast) throw new Error('De weerdienst gaf iets onverwachts terug.')
  weatherStore.update((s) => ({ ...s, cache: { ...s.cache, [key]: { at: now, forecast } } }))
  return forecast
}

export function addPlace(place: WeatherPlace): void {
  weatherStore.update((s) => {
    const i = s.places.findIndex((p) => placeKey(p) === placeKey(place))
    if (i >= 0) return { ...s, selected: i }
    const places = [...s.places, place].slice(-MAX_WEATHER_PLACES)
    return { ...s, places, selected: places.length - 1 }
  })
}

export function removePlace(index: number): void {
  weatherStore.update((s) => {
    const gone = s.places[index]
    if (!gone) return s
    const places = s.places.filter((_, i) => i !== index)
    const cache = { ...s.cache }
    delete cache[placeKey(gone)]
    return { ...s, places, selected: Math.min(s.selected, Math.max(0, places.length - 1)), cache }
  })
}

/** Forecasts older than this are not used in the Dagstart: better no weather than stale weather. */
const DAGSTART_MAX_AGE_MS = 12 * 60 * 60_000

/** The weather line for the Dagstart of [dayStart], from your first place in Weer; null when there is none. */
export function weatherForDagstart(dayStart: number, now = Date.now()): string | null {
  const s = weatherStore.getSnapshot()
  const place = s.places[0]
  if (!s.inDagstart || !place) return null
  const cached = s.cache[placeKey(place)]
  if (!cached || now - cached.at > DAGSTART_MAX_AGE_MS) return null
  return dagstartWeatherLine(place.name, cached.forecast, dayStart)
}

const REFRESH_CHECK_MS = 5 * 60_000

/**
 * Keeps the first place's forecast fresh while NEXUS runs and Weer is on, so the Dagstart has it in
 * the morning. At most one request per half hour; nothing is asked while offline.
 */
export function startWeatherRefresh(enabled: () => boolean): () => void {
  const tick = () => {
    const place = weatherStore.getSnapshot().places[0]
    if (!enabled() || !place || !weatherStore.getSnapshot().inDagstart) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    void refreshForecast(place).catch(() => {})
  }
  tick()
  const timer = setInterval(tick, REFRESH_CHECK_MS)
  return () => clearInterval(timer)
}
