import { CALENDAR_DAYS_AHEAD, calendarUrl, googleCalendarUrl, parseIcs, type CalendarEvent } from '@nexus/core'
import { logEvent } from '../devtools/log'
import { apiBase } from '../platform/desktop'
import { supabase } from '../sync/supabase'
import { profilesStore, type ProfilesStore } from './store'

/** How often the lessons are refreshed while NEXUS runs. */
const REFRESH_MS = 6 * 60 * 60_000

type Fetch = (url: string, init: RequestInit) => Promise<Response>

async function accessToken(): Promise<string | null> {
  return (await supabase?.auth.getSession())?.data.session?.access_token ?? null
}

type Deps = { fetch: Fetch; token: () => Promise<string | null>; now: () => number }
const defaultDeps: Deps = { fetch: (u, i) => fetch(u, i), token: accessToken, now: Date.now }

/** The coming weeks of events behind [url], fetched through the NEXUS server, or an error text in Dutch. */
async function fetchEvents(url: string, deps: Deps): Promise<CalendarEvent[] | string> {
  const token = await deps.token()
  if (!token) return 'Meld je aan in de Account-app om je agenda op te halen.'
  let text: string
  try {
    const response = await deps.fetch(`${apiBase}/api/calendar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ url }),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      return body?.error ?? `Agenda ophalen mislukt (${response.status}).`
    }
    text = await response.text()
  } catch {
    return 'Geen verbinding. Wat al opgehaald was, blijft bewaard.'
  }
  const now = deps.now()
  return parseIcs(text, now - 24 * 60 * 60_000, now + CALENDAR_DAYS_AHEAD * 24 * 60 * 60_000)
}

/**
 * Fetches the school calendar through the NEXUS server and stores the coming weeks of lessons.
 * Returns an error text in Dutch, or null when it worked.
 */
export async function syncCalendar(
  link: string = profilesStore.getSnapshot().state.calendarUrl,
  store: ProfilesStore = profilesStore,
  deps: Deps = defaultDeps,
): Promise<string | null> {
  const url = calendarUrl(link)
  if (!url) return 'Dit is geen agendalink van school. Kopieer de link van "Koppel agenda" op het intranet.'
  const events = await fetchEvents(url, deps)
  if (typeof events === 'string') return events
  store.update((s) => ({ ...s, calendarUrl: url, calendarEvents: events, calendarSyncedAt: deps.now() }))
  logEvent('system', `Agenda: ${events.length} lessen opgehaald`)
  return null
}

/** Fetches a Google Agenda through its iCal address and stores the coming weeks of events. */
export async function syncGoogle(
  link: string = profilesStore.getSnapshot().state.googleUrl,
  store: ProfilesStore = profilesStore,
  deps: Deps = defaultDeps,
): Promise<string | null> {
  const url = googleCalendarUrl(link)
  if (!url) return 'Dit is geen iCal-adres van Google Agenda. Kopieer het "Geheime adres in iCal-indeling" uit de instellingen van je agenda.'
  const events = await fetchEvents(url, deps)
  if (typeof events === 'string') return events
  store.update((s) => ({ ...s, googleUrl: url, googleEvents: events, googleSyncedAt: deps.now() }))
  logEvent('system', `Google Agenda: ${events.length} afspraken opgehaald`)
  return null
}

/** Refreshes the lessons and the Google Agenda at start and every few hours, when a link is set. */
export function startCalendarSync(store: ProfilesStore = profilesStore): () => void {
  const stale = (at: number | null) => at === null || Date.now() - at > REFRESH_MS
  const run = () => {
    const { calendarUrl: link, calendarSyncedAt, googleUrl, googleSyncedAt } = store.getSnapshot().state
    if (link && stale(calendarSyncedAt)) void syncCalendar(link, store)
    if (googleUrl && stale(googleSyncedAt)) void syncGoogle(googleUrl, store)
  }
  const first = setTimeout(run, 5_000)
  const timer = setInterval(run, 30 * 60_000)
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
