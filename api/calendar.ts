import { cors, emailForToken, env, json } from './_shared.js'

/**
 * Fetches a school calendar link (an .ics export) or a Google Agenda iCal address for the logged-in
 * user. Browsers may not read those links directly, so NEXUS asks here. Only links on CALENDAR_HOSTS
 * and Google Agenda's /calendar/ical/ addresses are fetched.
 *
 * Vercel environment variables:
 *   NEXUS_CALENDAR_HOSTS   optional, comma-separated hosts; defaults to apih.ap.be (the AP intranet)
 */

// Below the 4.5 MB a Vercel function may answer; a Google Agenda with years of history can be large.
const MAX_BYTES = 4_000_000
const GOOGLE_HOST = 'calendar.google.com'

export function allowedUrl(text: unknown, hosts: string[]): string | null {
  if (typeof text !== 'string') return null
  let url: URL
  try {
    url = new URL(text.trim().replace(/^webcal:/i, 'https:'))
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  if (!hosts.includes(host)) return null
  if (host === GOOGLE_HOST && !(url.pathname.startsWith('/calendar/ical/') && url.pathname.endsWith('.ics'))) return null
  return url.href.length <= 500 ? url.href : null
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: cors(request) })
}

export async function POST(request: Request): Promise<Response> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json(request, 401, 'Meld je aan in de Account-app om je agenda op te halen.')
  try {
    if (!(await emailForToken(token))) return json(request, 401, 'Je sessie is verlopen. Meld je opnieuw aan.')
  } catch (err) {
    return json(request, 503, err instanceof Error ? err.message : 'Aanmelding controleren mislukt.')
  }

  let body: { url?: unknown }
  try {
    body = (await request.json()) as { url?: unknown }
  } catch {
    return json(request, 400, 'Ongeldige aanvraag.')
  }
  const hosts = (env('NEXUS_CALENDAR_HOSTS') ?? 'apih.ap.be').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
  const url = allowedUrl(body.url, [...hosts, GOOGLE_HOST])
  if (!url) return json(request, 400, 'Dit is geen agendalink die NEXUS kan lezen. Gebruik de link van "Koppel agenda" op het intranet of het geheime iCal-adres van Google Agenda.')

  let text: string
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { accept: 'text/calendar' } })
    if (!response.ok) return json(request, 502, `De agenda gaf een fout (${response.status}). Klopt de link nog?`)
    text = await response.text()
  } catch {
    return json(request, 502, 'De agenda reageert niet. Probeer het later opnieuw.')
  }
  if (text.length > MAX_BYTES || !text.includes('BEGIN:VCALENDAR')) return json(request, 502, 'Deze link geeft geen agenda terug.')
  return new Response(text, { status: 200, headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store', ...cors(request) } })
}
