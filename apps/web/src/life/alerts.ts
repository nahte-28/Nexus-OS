import { deadlineNotices, type LifeItem } from '@nexus/core'
import type { ConnectEngine } from '../connect/engine'
import { logEvent } from '../devtools/log'
import { showLocalNotification } from '../platform/notify'
import { readStorage, writeStorage } from '../state/storage'
import { lifeStore, type LifeStore } from './store'

const CHECKED_KEY = 'nexus.life.checkedAt'
const CHECK_MS = 30_000
/** Notifications missed while NEXUS was closed still come, if they are this recent. */
const CATCH_UP_MS = 6 * 60 * 60_000
/** At most this many missed ones at once, so a new device does not flood. */
const MAX_AT_ONCE = 3

export interface DeadlineEffects {
  local(title: string, text: string, ref: string): Promise<unknown>
  phones(title: string, text: string, ref: string): Promise<unknown>
}

export function defaultDeadlineEffects(connect: Pick<ConnectEngine, 'notifyPhones'>): DeadlineEffects {
  return {
    local: (title, text, ref) => showLocalNotification(title, text, ref),
    phones: (title, text, ref) => connect.notifyPhones(title, text, ref),
  }
}

/**
 * Sends the notifications of deadlines that came due since the last check. Every device that runs
 * NEXUS does this; the phone shows each one once, because they share a ref.
 */
export async function fireDeadlineNotices(items: LifeItem[], effects: DeadlineEffects, now = Date.now()): Promise<number> {
  const checked = Number(readStorage(CHECKED_KEY))
  const from = Math.max(Number.isFinite(checked) && checked > 0 ? checked : 0, now - CATCH_UP_MS)
  const due = deadlineNotices(items, from, now).slice(-MAX_AT_ONCE)
  writeStorage(CHECKED_KEY, String(now))
  for (const n of due) {
    await effects.local(n.title, n.text ?? '', n.ref).catch(() => {})
    if (n.target === 'phone') {
      try {
        await effects.phones(n.title, n.text ?? '', n.ref)
      } catch (err) {
        logEvent('reminders', `Deadline naar gsm versturen mislukt: ${err instanceof Error ? err.message : err}`, true)
      }
    }
    logEvent('reminders', 'Deadlinemelding verstuurd')
  }
  return due.length
}

/** Checks for due deadline notifications while NEXUS runs; one tab does it (Web Locks). */
export function startDeadlineAlerts(connect: ConnectEngine, store: LifeStore = lifeStore): () => void {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  let release: (() => void) | undefined
  const effects = defaultDeadlineEffects(connect)
  const run = () => {
    const tick = () => void store.ready.then(() => fireDeadlineNotices(store.getSnapshot(), effects))
    tick()
    timer = setInterval(tick, CHECK_MS)
  }
  if (typeof navigator !== 'undefined' && navigator.locks) {
    void navigator.locks.request('nexus-deadlines', () => {
      if (stopped) return
      run()
      return new Promise<void>((resolve) => (release = resolve))
    })
  } else {
    run()
  }
  return () => {
    stopped = true
    clearInterval(timer)
    release?.()
  }
}
