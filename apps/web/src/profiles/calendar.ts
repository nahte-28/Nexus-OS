import { CALENDAR_DAYS_AHEAD, calendarUrl, parseIcs } from '@nexus/core'
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

/**
 * Fetches the school calendar through the NEXUS server and stores the coming weeks of lessons.
 * Returns an error text in Dutch, or null when it worked.
 */
export async function syncCalendar(
  link: string = profilesStore.getSnapshot().state.calendarUrl,
  store: ProfilesStore = profilesStore,
  deps: { fetch: Fetch; token: () => Promise<string | null>; now: () => number } = { fetch: (u, i) => fetch(u, i), token: accessToken, now: Date.now },
): Promise<string | null> {
  const url = calendarUrl(link)
  if (!url) return 'Dit is geen agendalink van school. Kopieer de link van "Koppel agenda" op het intranet.'
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
    return 'Geen verbinding. Je vorige lessen blijven bewaard.'
  }
  const now = deps.now()
  const events = parseIcs(text, now - 24 * 60 * 60_000, now + CALENDAR_DAYS_AHEAD * 24 * 60 * 60_000)
  store.update((s) => ({ ...s, calendarUrl: url, calendarEvents: events, calendarSyncedAt: now }))
  logEvent('system', `Agenda: ${events.length} lessen opgehaald`)
  return null
}

/** Refreshes the lessons at start and every few hours, when a calendar link is set. */
export function startCalendarSync(store: ProfilesStore = profilesStore): () => void {
  const run = () => {
    const { calendarUrl: link, calendarSyncedAt } = store.getSnapshot().state
    if (link && (calendarSyncedAt === null || Date.now() - calendarSyncedAt > REFRESH_MS)) void syncCalendar(link, store)
  }
  const first = setTimeout(run, 5_000)
  const timer = setInterval(run, 30 * 60_000)
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
