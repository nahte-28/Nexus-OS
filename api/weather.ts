import { cors, json } from './_shared.js'

/**
 * Weer: asks Open-Meteo (free, no key) for a forecast or for places matching a name. Only these two
 * fixed addresses, so this is never a general proxy. Coordinates are rounded to about 1 km before
 * they leave NEXUS. No login needed: the weather is not personal and Open-Meteo stores nothing.
 */

const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search'
const TIMEOUT_MS = 10_000

export function forecastUrl(lat: unknown, lon: unknown): string | null {
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  const p = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation,is_day',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'auto',
    timeformat: 'unixtime',
    forecast_days: '7',
    forecast_hours: '24',
  })
  return `${FORECAST}?${p}`
}

export function searchUrl(q: unknown): string | null {
  if (typeof q !== 'string') return null
  const name = q.trim()
  if (name.length < 2 || name.length > 80) return null
  return `${GEOCODING}?${new URLSearchParams({ name, count: '5', language: 'nl', format: 'json' })}`
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: cors(request) })
}

export function POST(request: Request): Promise<Response> {
  return handleWeather(request, fetch)
}

export async function handleWeather(request: Request, doFetch: typeof fetch): Promise<Response> {
  let body: { lat?: unknown; lon?: unknown; q?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json(request, 400, 'Ongeldige aanvraag.')
  }
  const url = body.q !== undefined ? searchUrl(body.q) : forecastUrl(body.lat, body.lon)
  if (!url) return json(request, 400, body.q !== undefined ? 'Tik minstens twee letters van een plaats.' : 'Die plaats klopt niet.')
  let response: Response
  try {
    response = await doFetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json', 'user-agent': 'NEXUS-OS-Weer/1.0' } })
  } catch {
    return json(request, 502, 'De weerdienst reageert niet. Probeer het straks opnieuw.')
  }
  if (!response.ok) return json(request, 502, `De weerdienst gaf een fout (${response.status}).`)
  const text = await response.text()
  if (text.length > 200_000) return json(request, 502, 'De weerdienst gaf te veel terug.')
  return new Response(text, { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(request) } })
}
