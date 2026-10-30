import { dagstartNotice, dagstartNotices, wallDate, type AgendaInput, type DagstartExtra, type DagstartSettings } from '@nexus/core'
import { dagstartExtra, recordBriefing } from '../briefing/store'
import type { ConnectEngine } from '../connect/engine'
import { logEvent } from '../devtools/log'
import { profilesStore } from '../profiles/store'
import { remindersStore } from '../reminders/store'
import { readStorage, writeStorage } from '../state/storage'
import { defaultDeadlineEffects, type DeadlineEffects } from './alerts'
import { lifeStore } from './store'

const CHECKED_KEY = 'nexus.dagstart.checkedAt'
const CHECK_MS = 30_000
/** A morning overview is still worth showing this late, e.g. when the pc starts at 9. */
const CATCH_UP_MS = 3 * 60 * 60_000

/** Lessons, agenda and reminders as Dagstart reads them. */
export function dagstartInput(): AgendaInput {
  const { state } = profilesStore.getSnapshot()
  return { calendarEvents: state.calendarEvents, googleEvents: state.googleEvents, timetable: state.lessons, items: lifeStore.getSnapshot(), reminders: remindersStore.getSnapshot() }
}

export const dagstartSettings = (): DagstartSettings => profilesStore.getSnapshot().state.dagstart

/**
 * Shows the Dagstart that came due since the last check, and sends it to the phone. Every device
 * that runs NEXUS does this; the phone shows it once, because it carries the day's ref.
 */
export async function fireDagstart(input: AgendaInput, settings: DagstartSettings, effects: DeadlineEffects, now = Date.now(), extra?: DagstartExtra): Promise<number> {
  const checked = Number(readStorage(CHECKED_KEY))
  const from = Math.max(Number.isFinite(checked) && checked > 0 ? checked : 0, now - CATCH_UP_MS)
  writeStorage(CHECKED_KEY, String(now))
  const notice = dagstartNotices(input, settings, from, now, extra).at(-1)
  if (!notice) return 0
  const date = notice.ref.slice('dagstart:'.length)
  await effects
    .local(notice.title, notice.text ?? '', notice.ref)
    .then(() => recordBriefing(date, 'local', notice.title, false, now))
    .catch(() => {})
  if (settings.target === 'phone') {
    try {
      await effects.phones(notice.title, notice.text ?? '', notice.ref)
      recordBriefing(date, 'phone', notice.title, false, now)
    } catch (err) {
      logEvent('reminders', `Dagstart naar gsm versturen mislukt: ${err instanceof Error ? err.message : err}`, true)
    }
  }
  logEvent('reminders', 'Dagstart verstuurd')
  return 1
}

/** Today's Dagstart right now, to see how it looks; with its own ref, so the real one still comes. */
export async function sendDagstartTest(effects: DeadlineEffects, now = Date.now()): Promise<void> {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const settings = dagstartSettings()
  const notice = dagstartNotice(dagstartInput(), today.getTime(), settings, dagstartExtra())
  const ref = `dagstart-proef:${now}`
  const date = wallDate(today.getTime())
  await effects.local(notice.title, notice.text ?? '', ref)
  recordBriefing(date, 'local', notice.title, true, now)
  if (settings.target === 'phone') {
    await effects.phones(notice.title, notice.text ?? '', ref)
    recordBriefing(date, 'phone', notice.title, true, now)
  }
}

/** Checks for the morning's Dagstart while NEXUS runs; one tab does it (Web Locks). */
export function startDagstart(connect: ConnectEngine): () => void {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  let release: (() => void) | undefined
  const effects = defaultDeadlineEffects(connect)
  const run = () => {
    const tick = () => void Promise.all([lifeStore.ready, remindersStore.ready]).then(() => fireDagstart(dagstartInput(), dagstartSettings(), effects, Date.now(), dagstartExtra()))
    tick()
    timer = setInterval(tick, CHECK_MS)
  }
  if (typeof navigator !== 'undefined' && navigator.locks) {
    void navigator.locks.request('nexus-dagstart', () => {
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
