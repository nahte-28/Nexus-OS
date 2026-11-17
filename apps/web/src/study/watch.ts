import { togetherForWatch, type ActionPayload, type PlanTogether, type TogetherSession } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from '../devtools/log'
import { logTogether, markJoined, StudyTogether } from './together'

/**
 * Samen studeren on the watch: this device keeps the open sessions of your friends and teammates,
 * and the safety net sends them to the watch with the plan (safety/plan.ts). The watch counts the
 * blocks itself and buzzes at each switch. Joining or leaving there comes back as the action
 * "together".
 */

const POLL_MS = 2 * 60_000

let sessions: PlanTogether[] = []
const listeners = new Set<() => void>()
let active: { api: Pick<StudyTogether, 'list' | 'join' | 'leave'>; refresh: () => Promise<void> } | null = null

function set(next: PlanTogether[]) {
  if (JSON.stringify(next) === JSON.stringify(sessions)) return
  sessions = next
  for (const fn of listeners) fn()
}

export const togetherWatchStore = {
  getSnapshot: (): PlanTogether[] => sessions,
  subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },
}

/** What Studie › Samen just read, so the watch hears about it at once. */
export function showTogetherOnWatch(list: TogetherSession[]): void {
  set(togetherForWatch(list))
}

/** Reads the open sessions; a focus block that ended while you were in one goes in your focus log. */
export async function syncTogetherForWatch(api: Pick<StudyTogether, 'list'>, now = Date.now()): Promise<void> {
  const list = await api.list()
  for (const s of list) if (s.joined) logTogether(s, now)
  showTogetherOnWatch(list)
}

/** For tests. */
export function setTogetherWatchApi(api: Pick<StudyTogether, 'list' | 'join' | 'leave'> | null) {
  active = api ? { api, refresh: () => syncTogetherForWatch(api) } : null
  if (!api) set([])
}

/** You joined or left a session on the watch. Joining again or leaving twice does no harm. */
export async function applyWatchTogether(action: Extract<ActionPayload, { action: 'together' }>): Promise<void> {
  if (!active) {
    logEvent('connect', 'Samen studeren: het horloge stuurde iets, maar je bent hier niet aangemeld', true)
    return
  }
  try {
    if (action.op === 'join') {
      await active.api.join(action.id)
      markJoined(action.id, action.at)
      logEvent('connect', 'Samen studeren: meegedaan vanaf het horloge')
    } else {
      await active.api.leave(action.id)
      logEvent('connect', 'Samen studeren: verlaten vanaf het horloge')
    }
  } catch (err) {
    logEvent('connect', `Samen studeren vanaf het horloge mislukt: ${err instanceof Error ? err.message : String(err)}`, true)
  }
  await active.refresh().catch(() => {})
}

/** Follows the open sessions while you are signed in and Vrienden or Teams is on: every 2 minutes. */
export function startTogetherForWatch(client: SupabaseClient | null, enabled: () => boolean): () => void {
  if (!client) return () => {}
  const api = new StudyTogether(client)
  let signedIn = false
  let running = false
  const run = async (): Promise<void> => {
    if (!signedIn) return
    if (!enabled()) return set([])
    if (running) return
    running = true
    try {
      await syncTogetherForWatch(api)
    } catch (err) {
      // Not set up yet, or offline: the watch keeps what it had until the next try.
      const message = err instanceof Error ? err.message : String(err)
      if (!message.startsWith('setup:')) logEvent('sync', `Samen studeren voor het horloge: ${message}`, true)
    } finally {
      running = false
    }
  }
  const setSession = (on: boolean) => {
    if (on === signedIn) return
    signedIn = on
    if (on) {
      active = { api, refresh: run }
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
    clearInterval(poll)
    data.subscription.unsubscribe()
  }
}
