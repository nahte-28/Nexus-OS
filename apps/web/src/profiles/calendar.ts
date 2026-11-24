import { CALENDAR_DAYS_AHEAD, calendarUrl, googleCalendarUrl, icsUrl, MAX_EXTRA_CALENDARS, parseIcs, type CalendarEvent } from '@nexus/core'
import { logEvent } from '../devtools/log'
import { apiBase } from '../platform/desktop'
import { supabase } from '../sync/supabase'
import { profilesStore, type ProfilesStore } from './store'

/** How often the school lessons are refreshed while NEXUS runs; they rarely change during the day. */
const SCHOOL_REFRESH_MS = 60 * 60_000
/** Google Agenda and the other calendars: a change made there shows in NEXUS within a quarter of an hour. */
const LINKED_REFRESH_MS = 15 * 60_000
/** When NEXUS comes back to the front (or the Agenda opens), calendars older than this are fetched again. */
const ON_RETURN_MS = 3 * 60_000
/** How often NEXUS checks whether a calendar is due. */
const CHECK_MS = 5 * 60_000

/** The last background error per calendar ('school', 'google' or an extra calendar's id), so the Agenda can show it. */
class CalendarProblems {
  private problems: Record<string, string> = {}
  private listeners = new Set<() => void>()
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  getSnapshot = (): Record<string, string> => this.problems
  set(id: string, error: string | null): void {
    if ((this.problems[id] ?? null) === error) return
    const next = { ...this.problems }
    if (error === null) delete next[id]
    else next[id] = error
    this.problems = next
    this.listeners.forEach((l) => l())
  }
}
export const calendarProblems = new CalendarProblems()

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
  calendarProblems.set('school', typeof events === 'string' ? events : null)
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
  calendarProblems.set('google', typeof events === 'string' ? events : null)
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
  if (existing) calendarProblems.set(id, typeof events === 'string' ? events : null)
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

/** Calendars fetched right now, so a refresh button and the timer never ask twice at once. */
const running = new Map<string, Promise<string | null>>()
function once(id: string, job: () => Promise<string | null>): Promise<string | null> {
  const busy = running.get(id)
  if (busy) return busy
  const p = job().finally(() => running.delete(id))
  running.set(id, p)
  return p
}

/**
 * Fetches every linked calendar whose copy is older than [maxAge] (0: all of them, as the Vernieuwen
 * button does). Resolves with the errors in Dutch, empty when everything worked.
 */
export async function refreshCalendars(store: ProfilesStore = profilesStore, maxAge?: number, now: number = Date.now(), deps: Deps = defaultDeps): Promise<string[]> {
  const { calendarUrl: link, calendarSyncedAt, googleUrl, googleSyncedAt, extraCalendars, extraEvents } = store.getSnapshot().state
  const due = (at: number | null, normal: number) => at === null || now - at >= (maxAge ?? normal)
  const jobs: Promise<string | null>[] = []
  if (link && due(calendarSyncedAt, SCHOOL_REFRESH_MS)) jobs.push(once('school', () => syncCalendar(link, store, deps)))
  if (googleUrl && due(googleSyncedAt, LINKED_REFRESH_MS)) jobs.push(once('google', () => syncGoogle(googleUrl, store, deps)))
  for (const c of extraCalendars) {
    if (due(extraEvents[c.id]?.syncedAt ?? null, LINKED_REFRESH_MS)) jobs.push(once(c.id, () => syncExtra(c.url, c.name, c.id, store, deps)))
  }
  return (await Promise.all(jobs)).filter((e): e is string => e !== null)
}

/**
 * Keeps the calendars fresh while NEXUS runs: at start, every quarter of an hour for Google Agenda and
 * the other calendars (hourly for school), and as soon as NEXUS comes back to the front.
 */
export function startCalendarSync(store: ProfilesStore = profilesStore): () => void {
  const run = () => void refreshCalendars(store)
  const back = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') void refreshCalendars(store, ON_RETURN_MS)
  }
  const first = setTimeout(run, 5_000)
  const timer = setInterval(run, CHECK_MS)
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', back)
    document.addEventListener('visibilitychange', back)
  }
  return () => {
    clearTimeout(first)
    clearInterval(timer)
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', back)
      document.removeEventListener('visibilitychange', back)
    }
  }
}

/** For the Agenda: on opening, calendars older than a few minutes are fetched again. */
export const refreshOnOpen = (store: ProfilesStore = profilesStore): Promise<string[]> => refreshCalendars(store, ON_RETURN_MS)
