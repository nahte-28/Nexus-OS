import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { cors, emailForToken, env, json } from './_shared.js'

/**
 * Fetches a calendar link (.ics) for the logged-in user: the school calendar, a Google Agenda iCal
 * address or any other public calendar (Outlook, iCloud, a club). Browsers may not read those links
 * directly, so NEXUS asks here. Only https on the normal port, never to a bare IP address or a name
 * that points into a private network, and every redirect is checked the same way.
 *
 * Vercel environment variables:
 *   NEXUS_CALENDAR_HOSTS   optional, comma-separated hosts; defaults to apih.ap.be (the AP intranet)
 */

// Below the 4.5 MB a Vercel function may answer. A Google Agenda with years of history can be far
// larger, so past events are left out first (see trimPast); only the raw download has a higher cap.
const MAX_BYTES = 4_000_000
const MAX_RAW_BYTES = 40_000_000
/** Events that ended more than this long ago are not sent on; NEXUS only shows from yesterday on. */
const KEEP_PAST_MS = 3 * 24 * 60 * 60_000

/** The date (UTC midnight) in a DTSTART/DTEND/UNTIL value such as 20261124T100000Z or 20261124; precise enough with a margin of days. */
function dayOf(value: string | undefined): number | null {
  const m = value && /(\d{4})(\d{2})(\d{2})/.exec(value)
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/**
 * The calendar without the events that are over before [cutoff]: one-off events that ended earlier
 * and series whose UNTIL lies before it. Series without an end, time zones and everything else stay,
 * so NEXUS reads the coming weeks exactly as before, also for a calendar with years of history.
 */
export function trimPast(ics: string, cutoff: number): string {
  return ics.replace(/BEGIN:VEVENT\r?\n[\s\S]*?END:VEVENT\r?\n?/g, (block) => {
    const unfolded = block.replace(/\r?\n[ \t]/g, '')
    const prop = (name: string) => new RegExp(`^${name}(?:;[^:\\r\\n]*)?:([^\\r\\n]*)`, 'm').exec(unfolded)?.[1]
    const rule = prop('RRULE')
    if (rule) {
      const until = dayOf(/UNTIL=([0-9TZ]+)/.exec(rule)?.[1])
      return until !== null && until + 24 * 60 * 60_000 < cutoff ? '' : block
    }
    // A moved occurrence stays while either its old or its new time is recent, so the series skips the old one.
    const end = Math.max(dayOf(prop('DTEND')) ?? dayOf(prop('DTSTART')) ?? Infinity, dayOf(prop('RECURRENCE-ID')) ?? -Infinity)
    return end + 24 * 60 * 60_000 < cutoff ? '' : block
  })
}

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

/** How many times a calendar link may send NEXUS on to another address (iCloud and Outlook do this). */
const MAX_REDIRECTS = 5
/** Big calendars (Outlook, years of Google history) can take a while. */
const TIMEOUT_MS = 20_000

type Fetch = typeof fetch

/**
 * Fetches the calendar behind [url], following redirects by hand so every next address is checked
 * like the first: public https only, never into a private network. The text, or an error in Dutch.
 */
export async function fetchCalendar(url: string, checkFirst: boolean, doFetch: Fetch = fetch, outside: (url: string) => Promise<boolean> = pointsOutside): Promise<string | { status: number; error: string }> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  let at = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if ((hop > 0 || checkFirst) && !(await outside(at))) return { status: 400, error: 'Deze agendalink wijst niet naar een openbare website.' }
    let response: Response
    try {
      response = await doFetch(at, { redirect: 'manual', signal, headers: { accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5', 'user-agent': 'NEXUS-OS-Agenda/1.0' } })
    } catch (err) {
      const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      return { status: 502, error: timeout ? 'De agenda deed er te lang over om te antwoorden. Probeer het later opnieuw.' : 'De agenda reageert niet. Klopt de link, en is de agenda openbaar of gedeeld?' }
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      const next = location ? publicUrl(new URL(location, at).href) : null
      if (!next) return { status: 502, error: 'De agenda stuurt door naar een adres dat NEXUS niet mag openen.' }
      at = next
      continue
    }
    if (!response.ok) return { status: 502, error: `De agenda gaf een fout (${response.status}). Klopt de link nog, en is de agenda openbaar of gedeeld?` }
    try {
      return await response.text()
    } catch {
      return { status: 502, error: 'De agenda deed er te lang over om te antwoorden. Probeer het later opnieuw.' }
    }
  }
  return { status: 502, error: 'De agenda stuurt te vaak door.' }
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

  const got = await fetchCalendar(url, !known)
  if (typeof got !== 'string') return json(request, got.status, got.error)
  if (got.length > MAX_RAW_BYTES || !got.includes('BEGIN:VCALENDAR')) return json(request, 502, 'Deze link geeft geen agenda terug.')
  const text = trimPast(got, Date.now() - KEEP_PAST_MS)
  if (text.length > MAX_BYTES) return json(request, 502, 'Deze agenda is te groot om op te halen, ook zonder de afspraken van vroeger.')
  if (!text.includes('BEGIN:VCALENDAR')) return json(request, 502, 'Deze link geeft geen agenda terug.')
  return new Response(text, { status: 200, headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store', ...cors(request) } })
}
