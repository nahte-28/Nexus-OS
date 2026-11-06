import { birthdayNotices, type ContactsState } from '@nexus/core'
import type { ConnectEngine } from '../connect/engine'
import { logEvent } from '../devtools/log'
import { defaultDeadlineEffects, type DeadlineEffects } from '../life/alerts'
import { readStorage, writeStorage } from '../state/storage'
import { contactsStore } from './store'

const CHECKED_KEY = 'nexus.contacts.checkedAt'
const CHECK_MS = 60_000
/** A birthday notice missed while NEXUS was closed still comes the same day. */
const CATCH_UP_MS = 12 * 60 * 60_000

/** Sends the birthday notices that came due since the last check. */
export async function fireBirthdayNotices(state: ContactsState, effects: DeadlineEffects, enabled: boolean, now = Date.now()): Promise<number> {
  const checked = Number(readStorage(CHECKED_KEY))
  const from = Math.max(Number.isFinite(checked) && checked > 0 ? checked : 0, now - CATCH_UP_MS)
  writeStorage(CHECKED_KEY, String(now))
  if (!enabled) return 0
  const due = birthdayNotices(state, from, now)
  for (const n of due) {
    await effects.local(n.title, n.text ?? '', n.ref).catch(() => {})
    if (n.target === 'phone') {
      try {
        await effects.phones(n.title, n.text ?? '', n.ref)
      } catch (err) {
        logEvent('reminders', `Verjaardag naar gsm versturen mislukt: ${err instanceof Error ? err.message : err}`, true)
      }
    }
  }
  return due.length
}

/** Checks for birthdays while NEXUS runs; one tab does it (Web Locks). */
export function startBirthdayAlerts(connect: ConnectEngine, enabled: () => boolean): () => void {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  let release: (() => void) | undefined
  const effects = defaultDeadlineEffects(connect)
  const run = () => {
    const tick = () => void fireBirthdayNotices(contactsStore.getSnapshot(), effects, enabled())
    tick()
    timer = setInterval(tick, CHECK_MS)
  }
  if (typeof navigator !== 'undefined' && navigator.locks) {
    void navigator.locks.request('nexus-birthdays', () => {
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
