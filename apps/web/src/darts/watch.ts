import { dartsForWatch, onlineWon, type ActionPayload, type PlanDartsGame } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from '../devtools/log'
import { DartsOnline, saveOnlineToHistory } from './online'

/**
 * Darts online on the watch: this device keeps your matches that are being played, and the safety
 * net sends them to the watch with the plan (safety/plan.ts). A visit entered on the watch comes back
 * as the action "darts_online" and goes into the match here.
 */

const POLL_MS = 5 * 60_000
const DEBOUNCE_MS = 1500

let games: PlanDartsGame[] = []
const listeners = new Set<() => void>()
let active: { api: Pick<DartsOnline, 'list' | 'end' | 'throwVisit'>; refresh: () => Promise<void> } | null = null

function set(next: PlanDartsGame[]) {
  if (JSON.stringify(next) === JSON.stringify(games)) return
  games = next
  for (const fn of listeners) fn()
}

export const dartsWatchStore = {
  getSnapshot: (): PlanDartsGame[] => games,
  subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },
}

/** Reads your matches; one that someone won is closed as done, like Darts › Online does. */
export async function syncDartsForWatch(api: Pick<DartsOnline, 'list' | 'end'>): Promise<void> {
  const list = await api.list()
  for (const g of list) if (g.status === 'playing' && onlineWon(g)) await api.end(g.id, 'done').catch(() => {})
  // Finished matches go to the history (and the ranking), also without opening Darts › Online.
  for (const g of list) saveOnlineToHistory(g)
  set(dartsForWatch(list))
}

/** For tests. */
export function setDartsWatchApi(api: Pick<DartsOnline, 'list' | 'end' | 'throwVisit'> | null) {
  active = api ? { api, refresh: () => syncDartsForWatch(api) } : null
  if (!api) set([])
}

/**
 * A visit entered on the watch. Every open NEXUS gets it; the first one adds it, and for the others
 * (and a visit the watch sent after the stand changed) the database answers that the stand changed,
 * so it counts once.
 */
export async function applyWatchOnlineVisit(action: Extract<ActionPayload, { action: 'darts_online' }>): Promise<void> {
  if (!active) {
    logEvent('connect', 'Darts online: een beurt van het horloge kwam binnen, maar je bent hier niet aangemeld', true)
    return
  }
  try {
    await active.api.throwVisit(action.id, action.seq, action.score, action.darts)
    logEvent('connect', `Darts online: beurt van ${action.score} van het horloge ingegeven`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!/stand veranderde/i.test(message)) logEvent('connect', `Darts online: beurt van het horloge niet ingegeven: ${message}`, true)
  }
  await active.refresh().catch(() => {})
}

/** Follows your online matches while you are signed in and Darts is on: live, and every 5 minutes. */
export function startDartsForWatch(client: SupabaseClient | null, enabled: () => boolean): () => void {
  if (!client) return () => {}
  const api = new DartsOnline(client)
  let signedIn = false
  let running = false
  let again = false
  let debounce: ReturnType<typeof setTimeout> | undefined
  let stopWatch: (() => void) | null = null
  const run = async (): Promise<void> => {
    if (!signedIn) return
    if (!enabled()) return set([])
    if (running) {
      again = true
      return
    }
    running = true
    try {
      await syncDartsForWatch(api)
    } catch (err) {
      // Not set up yet, or offline: the watch keeps what it had until the next try.
      const message = err instanceof Error ? err.message : String(err)
      if (!message.startsWith('setup:')) logEvent('sync', `Darts online voor het horloge: ${message}`, true)
    } finally {
      running = false
      if (again) {
        again = false
        void run()
      }
    }
  }
  const soon = () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => void run(), DEBOUNCE_MS)
  }
  const setSession = (on: boolean) => {
    if (on === signedIn) return
    signedIn = on
    stopWatch?.()
    stopWatch = null
    if (on) {
      active = { api, refresh: run }
      stopWatch = api.watch(soon)
      void run()
    } else {
      active = null
      set([])
    }
  }
  void client.auth.getSession().then(({ data }) => setSession(Boolean(data.session)))
  const { data } = client.auth.onAuthStateChange((_event, session) => setSession(Boolean(session)))
  const poll = setInterval(() => void run(), POLL_MS)
  return () => {
    clearTimeout(debounce)
    clearInterval(poll)
    stopWatch?.()
    data.subscription.unsubscribe()
  }
}
