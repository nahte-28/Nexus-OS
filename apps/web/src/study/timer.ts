import { newTimer, nextPhase, parseFocusSettings, pauseTimer, phaseEndNotice, phaseMs, startTimer, type FocusSettings, type FocusTimer } from '@nexus/core'
import type { ConnectEngine } from '../connect/engine'
import { logEvent } from '../devtools/log'
import { showLocalNotification } from '../platform/notify'
import { readStorage, writeStorage } from '../state/storage'

const SETTINGS_KEY = 'nexus.focus.settings'
const TIMER_KEY = 'nexus.focus.timer'
const LOG_KEY = 'nexus.focus.log'
const KEEP_DAYS = 60

export interface FocusLogEntry {
  at: number
  minutes: number
  task: string
}

export interface FocusState {
  settings: FocusSettings & { phone: boolean }
  timer: FocusTimer
  log: FocusLogEntry[]
}

function parse<T>(key: string, fallback: T): T {
  try {
    const raw = readStorage(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function load(): FocusState {
  const stored = parse<Record<string, unknown>>(SETTINGS_KEY, {})
  const settings = { ...parseFocusSettings(stored), phone: stored.phone === true }
  const t = parse<Partial<FocusTimer> | null>(TIMER_KEY, null)
  const timer =
    t && (t.phase === 'focus' || t.phase === 'break' || t.phase === 'long_break') && typeof t.remaining === 'number'
      ? { phase: t.phase, round: Number(t.round) || 0, endsAt: typeof t.endsAt === 'number' ? t.endsAt : null, remaining: t.remaining, task: typeof t.task === 'string' ? t.task : '' }
      : newTimer(settings)
  const log = parse<FocusLogEntry[]>(LOG_KEY, []).filter((e) => typeof e?.at === 'number' && typeof e.minutes === 'number')
  return { settings, timer, log }
}

type Listener = () => void

/**
 * The focus timer of this device. It lives in localStorage with its end time, so it keeps
 * running when the Studie window closes and every tab shows the same timer.
 */
export class FocusStore {
  private state: FocusState = load()
  private listeners = new Set<Listener>()

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === TIMER_KEY || e.key === SETTINGS_KEY || e.key === LOG_KEY) {
          this.state = load()
          this.emit()
        }
      })
    }
  }

  private emit(): void {
    for (const l of this.listeners) l()
  }

  private set(next: Partial<FocusState>): void {
    this.state = { ...this.state, ...next }
    if (next.timer) writeStorage(TIMER_KEY, JSON.stringify(this.state.timer))
    if (next.settings) writeStorage(SETTINGS_KEY, JSON.stringify(this.state.settings))
    if (next.log) writeStorage(LOG_KEY, JSON.stringify(this.state.log))
    this.emit()
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): FocusState => this.state

  start = (now = Date.now()) => this.set({ timer: startTimer(this.state.timer, now) })
  pause = (now = Date.now()) => this.set({ timer: pauseTimer(this.state.timer, now) })
  /** Back to the start of a fresh focus round. */
  reset = () => this.set({ timer: newTimer(this.state.settings, this.state.timer.task) })
  setTask = (task: string) => this.set({ timer: { ...this.state.timer, task: task.slice(0, 160) } })

  updateSettings(patch: Partial<FocusSettings & { phone: boolean }>): void {
    const settings = { ...parseFocusSettings({ ...this.state.settings, ...patch }), phone: patch.phone ?? this.state.settings.phone }
    const timer = this.state.timer
    // A timer that has not started yet takes the new length right away.
    const fresh = timer.endsAt === null && timer.remaining === phaseMs(timer.phase, this.state.settings)
    this.set({ settings, ...(fresh ? { timer: { ...timer, remaining: phaseMs(timer.phase, settings) } } : {}) })
  }

  /** Goes to the next phase now; a finished focus round counts in the log. */
  skip = (now = Date.now()) => this.finish(now, false)

  private finish(now: number, onTime: boolean): FocusTimer {
    const { timer, settings, log } = this.state
    const done = timer
    const next = nextPhase(timer, settings, now, timer.phase === 'focus')
    const minutes = done.phase === 'focus' ? Math.round((phaseMs('focus', settings) - (onTime ? 0 : Math.max(0, (done.endsAt ?? now + done.remaining) - now))) / 60_000) : 0
    const cutoff = now - KEEP_DAYS * 24 * 60 * 60_000
    this.set({ timer: next, ...(minutes > 0 ? { log: [...log.filter((e) => e.at >= cutoff), { at: now, minutes, task: done.task }] } : {}) })
    return done
  }

  /** Called by the ticker: ends a phase whose time is up and returns it, else null. */
  tick(now = Date.now()): FocusTimer | null {
    const { timer } = this.state
    if (timer.endsAt === null || timer.endsAt > now) return null
    return this.finish(now, true)
  }
}

export const focusStore = new FocusStore()

/** Minutes of focus since [from]. */
export const focusMinutes = (log: FocusLogEntry[], from: number) => log.filter((e) => e.at >= from).reduce((sum, e) => sum + e.minutes, 0)

/**
 * Sends the notification when a phase is over, also when the Studie window is closed. Only one
 * tab does it (Web Locks), so it comes once.
 */
export function startFocusTicker(connect: Pick<ConnectEngine, 'notifyPhones'>, store: FocusStore = focusStore): () => void {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  let release: (() => void) | undefined
  const run = () => {
    timer = setInterval(() => {
      const ended = store.tick()
      if (!ended) return
      const { settings } = store.getSnapshot()
      const { title, text } = phaseEndNotice(ended, settings)
      const tag = `focus:${ended.endsAt}`
      void showLocalNotification(title, text, tag)
      if (settings.phone) {
        void connect.notifyPhones(title, text, tag).catch((err: unknown) => logEvent('reminders', `Focusmelding naar gsm mislukt: ${String(err)}`, true))
      }
    }, 1000)
  }
  if (typeof navigator !== 'undefined' && navigator.locks) {
    void navigator.locks.request('nexus-focus', () => {
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
