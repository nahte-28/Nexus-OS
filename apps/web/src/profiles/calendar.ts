import { CALENDAR_DAYS_AHEAD, calendarUrl, googleCalendarUrl, icsUrl, MAX_EXTRA_CALENDARS, parseIcs, type CalendarEvent } from '@nexus/core'
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

/**
 * Adds another calendar link (or fetches one that is already there, by [id]) and stores its coming
 * weeks of events. Returns an error text in Dutch, or null when it worked.
 */
export async function syncExtra(
  link: string,
  name: string,
  id: string = crypto.randomUUID(),
  store: ProfilesStore = profilesStore,
  deps: Deps = defaultDeps,
): Promise<string | null> {
  const url = icsUrl(link)
  if (!url) return 'Dit is geen agendalink. Gebruik een adres dat begint met https:// of webcal:// (een iCal- of .ics-link).'
  const { extraCalendars } = store.getSnapshot().state
  const existing = extraCalendars.find((c) => c.id === id)
  if (!existing && extraCalendars.some((c) => c.url === url)) return 'Deze agenda is al gekoppeld.'
  if (!existing && extraCalendars.length >= MAX_EXTRA_CALENDARS) return `Je kunt hoogstens ${MAX_EXTRA_CALENDARS} andere agenda's koppelen.`
  const events = await fetchEvents(url, deps)
  if (typeof events === 'string') return events
  const label = name.trim().slice(0, 40) || existing?.name || new URL(url).hostname
  store.update((s) => ({
    ...s,
    extraCalendars: s.extraCalendars.some((c) => c.id === id) ? s.extraCalendars.map((c) => (c.id === id ? { id, name: label, url } : c)) : [...s.extraCalendars, { id, name: label, url }],
    extraEvents: { ...s.extraEvents, [id]: { events, syncedAt: deps.now() } },
  }))
  logEvent('system', `Agenda ${label}: ${events.length} afspraken opgehaald`)
  return null
}

/** Unlinks another calendar; its events leave the Agenda. */
export function removeExtra(id: string, store: ProfilesStore = profilesStore): void {
  store.update((s) => {
    const extraEvents = { ...s.extraEvents }
    delete extraEvents[id]
    return { ...s, extraCalendars: s.extraCalendars.filter((c) => c.id !== id), extraEvents }
  })
}

/** Refreshes the lessons, the Google Agenda and the other calendars at start and every few hours, when a link is set. */
export function startCalendarSync(store: ProfilesStore = profilesStore): () => void {
  const stale = (at: number | null) => at === null || Date.now() - at > REFRESH_MS
  const run = () => {
    const { calendarUrl: link, calendarSyncedAt, googleUrl, googleSyncedAt, extraCalendars, extraEvents } = store.getSnapshot().state
    if (link && stale(calendarSyncedAt)) void syncCalendar(link, store)
    if (googleUrl && stale(googleSyncedAt)) void syncGoogle(googleUrl, store)
    for (const c of extraCalendars) if (stale(extraEvents[c.id]?.syncedAt ?? null)) void syncExtra(c.url, c.name, c.id, store)
  }
  const first = setTimeout(run, 5_000)
  const timer = setInterval(run, 30 * 60_000)
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
