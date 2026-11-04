import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { cors, emailForToken, env, json } from './_shared.js'

/**
 * Fetches a calendar link (.ics) for the logged-in user: the school calendar, a Google Agenda iCal
 * address or any other public calendar (Outlook, iCloud, a club). Browsers may not read those links
 * directly, so NEXUS asks here. Only https on the normal port, never to a bare IP address or a name
 * that points into a private network, and no redirects.
 *
 * Vercel environment variables:
 *   NEXUS_CALENDAR_HOSTS   optional, comma-separated hosts; defaults to apih.ap.be (the AP intranet)
 */

// Below the 4.5 MB a Vercel function may answer; a Google Agenda with years of history can be large.
const MAX_BYTES = 4_000_000
const GOOGLE_HOST = 'calendar.google.com'

/** Loopback, private, link-local, carrier-grade NAT, multicast and other non-public addresses. */
export function privateAddress(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  }
  const h = ip.toLowerCase()
  return h === '::' || h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb') || h.startsWith('ff')
}

/** Any public https calendar address: a real host name (not an IP or a local name), no login in the link. */
export function publicUrl(text: unknown): string | null {
  if (typeof text !== 'string') return null
  let url: URL
  try {
    url = new URL(text.trim().replace(/^webcal:/i, 'https:'))
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  if (!host.includes('.') || isIP(host.replace(/^\[|\]$/g, '')) !== 0) return null
  if (host === 'localhost' || /\.(localhost|local|internal|lan|home|arpa)$/.test(host)) return null
  // Google Agenda only hands out its private addresses under /calendar/ical/.
  if (host === GOOGLE_HOST && !(url.pathname.startsWith('/calendar/ical/') && url.pathname.endsWith('.ics'))) return null
  return url.href.length <= 500 ? url.href : null
}

async function pointsOutside(url: string): Promise<boolean> {
  try {
    const addresses = await lookup(new URL(url).hostname, { all: true })
    return addresses.length > 0 && addresses.every((a) => !privateAddress(a.address))
  } catch {
    return false
  }
}

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
  // The school and Google hosts are known; any other address must point outside private networks.
  const known = allowedUrl(body.url, [...hosts, GOOGLE_HOST])
  const url = known ?? publicUrl(body.url)
  if (!url) return json(request, 400, 'Dit is geen agendalink die NEXUS kan lezen. Gebruik een https- of webcal-link naar een agenda (.ics).')
  if (!known && !(await pointsOutside(url))) return json(request, 400, 'Deze agendalink wijst niet naar een openbare website.')

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
