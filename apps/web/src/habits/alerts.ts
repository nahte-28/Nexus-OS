import { habitNotices, type HabitsState } from '@nexus/core'
import type { ConnectEngine } from '../connect/engine'
import { logEvent } from '../devtools/log'
import { defaultDeadlineEffects, type DeadlineEffects } from '../life/alerts'
import { readStorage, writeStorage } from '../state/storage'
import { habitsStore } from './store'

const CHECKED_KEY = 'nexus.habits.checkedAt'
const CHECK_MS = 30_000
/** A reminder missed while NEXUS was closed still comes when it is this recent. */
const CATCH_UP_MS = 2 * 60 * 60_000

/** Sends the reminders of open habits that came due since the last check. */
export async function fireHabitNotices(state: HabitsState, effects: DeadlineEffects, now = Date.now()): Promise<number> {
  const checked = Number(readStorage(CHECKED_KEY))
  const from = Math.max(Number.isFinite(checked) && checked > 0 ? checked : 0, now - CATCH_UP_MS)
  writeStorage(CHECKED_KEY, String(now))
  const due = habitNotices(state, from, now)
  for (const n of due) {
    await effects.local(n.title, n.text ?? '', n.ref).catch(() => {})
    if (n.target === 'phone') {
      try {
        await effects.phones(n.title, n.text ?? '', n.ref)
      } catch (err) {
        logEvent('reminders', `Gewoonte naar gsm versturen mislukt: ${err instanceof Error ? err.message : err}`, true)
      }
    }
  }
  return due.length
}

/** Checks for habit reminders while NEXUS runs; one tab does it (Web Locks). */
export function startHabitAlerts(connect: ConnectEngine): () => void {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  let release: (() => void) | undefined
  const effects = defaultDeadlineEffects(connect)
  const run = () => {
    const tick = () => void fireHabitNotices(habitsStore.getSnapshot(), effects)
    tick()
    timer = setInterval(tick, CHECK_MS)
  }
  if (typeof navigator !== 'undefined' && navigator.locks) {
    void navigator.locks.request('nexus-habits', () => {
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
