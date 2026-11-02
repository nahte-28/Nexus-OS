import { lessonBlocks, sleepNotice, sleepPlan, startGameTimer, stopGameTimer, type SleepPlan } from '@nexus/core'
import type { ConnectEngine } from '../connect/engine'
import { setFeature } from '../features/store'
import { defaultDeadlineEffects, type DeadlineEffects } from '../life/alerts'
import { chooseFor, profilesStore } from '../profiles/store'
import { readStorage, writeStorage } from '../state/storage'
import { gamingStore } from './store'

/** Shown in Profielen as "Gekozen door Gaming-sessie". */
export const SESSION_BY = 'Gaming-sessie'
const newId = () => crypto.randomUUID()

/** Starts the timer for a game and switches to Gaming until you stop. */
export function startGaming(gameId: string, now = Date.now()): string | null {
  setFeature('gaming', true)
  const next = startGameTimer(gamingStore.getSnapshot(), gameId, now, newId)
  if ('error' in next) return next.error
  gamingStore.update(() => next)
  chooseFor('gaming', 'until-manual', now, profilesStore, SESSION_BY)
  return null
}

/** Stops the timer, logs the session and leaves Gaming when the timer picked it. Returns the minutes. */
export function stopGaming(now = Date.now()): number {
  const { state, minutes } = stopGameTimer(gamingStore.getSnapshot(), now, newId)
  gamingStore.update(() => state)
  if (profilesStore.getSnapshot().state.override?.by === SESSION_BY) profilesStore.update((s) => ({ ...s, override: null }))
  return minutes
}

/** Tonight's Slaapbewaker plan, from the school calendar and Lesrooster. */
export function currentSleepPlan(now = Date.now()): SleepPlan | null {
  const profiles = profilesStore.getSnapshot().state
  // lessonBlocks covers yesterday to tomorrow around a moment; look from tomorrow morning too.
  const blocks = [...lessonBlocks(profiles, now), ...lessonBlocks(profiles, now + 12 * 3_600_000)]
  return sleepPlan(gamingStore.getSnapshot().settings.sleepGuard, blocks, now)
}

const CHECKED_KEY = 'nexus.gaming.sleepCheckedAt'
const CHECK_MS = 30_000

/** Sends the Slaapbewaker notice when it is due, only while you are gaming (profile or timer). */
export async function fireSleepNotice(effects: DeadlineEffects, now = Date.now()): Promise<boolean> {
  const checked = Number(readStorage(CHECKED_KEY))
  const from = Number.isFinite(checked) && checked > now - 10 * 60_000 ? checked : now - 60_000
  writeStorage(CHECKED_KEY, String(now))
  const gaming = profilesStore.getSnapshot().active.id === 'gaming' || gamingStore.getSnapshot().active !== null
  if (!gaming) return false
  const notice = sleepNotice(currentSleepPlan(now), from, now)
  if (!notice) return false
  await effects.local(notice.title, notice.text, notice.ref).catch(() => {})
  await effects.phones(notice.title, notice.text, notice.ref).catch(() => {})
  return true
}

/** Checks for the Slaapbewaker while NEXUS runs; one tab does it (Web Locks). */
export function startSleepGuard(connect: ConnectEngine): () => void {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  let release: (() => void) | undefined
  const effects = defaultDeadlineEffects(connect)
  const run = () => {
    timer = setInterval(() => void fireSleepNotice(effects), CHECK_MS)
  }
  if (typeof navigator !== 'undefined' && navigator.locks) {
    void navigator.locks.request('nexus-sleep-guard', () => {
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
