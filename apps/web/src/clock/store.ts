import { MAX_WORLD_CITIES, WORLD_CITIES, type StopwatchState, type TimerState } from '@nexus/core'
import { showLocalNotification } from '../platform/notify'
import { readStorage, writeStorage } from '../state/storage'

/** Klok on this device: world clock cities, timer and stopwatch (localStorage nexus.clock). */
export interface ClockState {
  zones: string[]
  timer: TimerState
  stopwatch: StopwatchState
}

const KEY = 'nexus.clock'
const ZONES = new Set(WORLD_CITIES.map((c) => c.zone))
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback)
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export const DEFAULT_CLOCK: ClockState = {
  zones: ['Europe/London', 'America/New_York', 'Asia/Tokyo'],
  timer: { duration: 5 * 60_000, endsAt: null, pausedLeft: null },
  stopwatch: { startedAt: null, elapsed: 0, laps: [] },
}

export function parseClock(raw: string | null): ClockState {
  try {
    const o = JSON.parse(raw ?? '') as Partial<ClockState>
    const zones = Array.isArray(o.zones) ? o.zones.filter((z): z is string => typeof z === 'string' && ZONES.has(z)).slice(0, MAX_WORLD_CITIES) : DEFAULT_CLOCK.zones
    const t = (o.timer ?? {}) as Partial<TimerState>
    const s = (o.stopwatch ?? {}) as Partial<StopwatchState>
    return {
      zones: [...new Set(zones)],
      timer: { duration: Math.min(num(t.duration, DEFAULT_CLOCK.timer.duration), 24 * 3_600_000), endsAt: numOrNull(t.endsAt), pausedLeft: numOrNull(t.pausedLeft) },
      stopwatch: {
        startedAt: numOrNull(s.startedAt),
        elapsed: num(s.elapsed, 0),
        laps: Array.isArray(s.laps) ? s.laps.filter((l): l is number => typeof l === 'number' && Number.isFinite(l)).slice(0, 99) : [],
      },
    }
  } catch {
    return DEFAULT_CLOCK
  }
}

let state = parseClock(readStorage(KEY))
const listeners = new Set<() => void>()
let ring: ReturnType<typeof setTimeout> | undefined

/** Rings when the timer ends, also when the Klok window is closed (as long as NEXUS is open). */
function scheduleRing(): void {
  clearTimeout(ring)
  const endsAt = state.timer.endsAt
  if (endsAt === null) return
  ring = setTimeout(() => {
    if (state.timer.endsAt !== endsAt) return
    clockStore.update((s) => ({ ...s, timer: { ...s.timer, endsAt: null, pausedLeft: null } }))
    void showLocalNotification('Timer afgelopen', 'Je timer in Klok is voorbij.', 'nexus-timer')
  }, Math.max(0, endsAt - Date.now()))
}

export const clockStore = {
  subscribe(l: () => void): () => void {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  getSnapshot: (): ClockState => state,
  update(fn: (s: ClockState) => ClockState): void {
    state = fn(state)
    writeStorage(KEY, JSON.stringify(state))
    scheduleRing()
    listeners.forEach((l) => l())
  },
}

scheduleRing()
