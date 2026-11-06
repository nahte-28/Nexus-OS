// Klok: world clock, timer and stopwatch helpers. Alarms themselves are reminders (reminders.ts).

export interface WorldCity {
  /** IANA time zone, like Europe/Brussels. */
  zone: string
  label: string
}

/** Cities to pick from in the world clock, in Dutch. */
export const WORLD_CITIES: WorldCity[] = [
  { zone: 'Europe/Brussels', label: 'Brussel' },
  { zone: 'Europe/London', label: 'Londen' },
  { zone: 'Europe/Lisbon', label: 'Lissabon' },
  { zone: 'Europe/Madrid', label: 'Madrid' },
  { zone: 'Europe/Istanbul', label: 'Istanboel' },
  { zone: 'Europe/Moscow', label: 'Moskou' },
  { zone: 'Africa/Casablanca', label: 'Casablanca' },
  { zone: 'Africa/Cairo', label: 'Caïro' },
  { zone: 'Africa/Kinshasa', label: 'Kinshasa' },
  { zone: 'Asia/Dubai', label: 'Dubai' },
  { zone: 'Asia/Kolkata', label: 'New Delhi' },
  { zone: 'Asia/Bangkok', label: 'Bangkok' },
  { zone: 'Asia/Shanghai', label: 'Peking' },
  { zone: 'Asia/Tokyo', label: 'Tokio' },
  { zone: 'Australia/Sydney', label: 'Sydney' },
  { zone: 'Pacific/Auckland', label: 'Auckland' },
  { zone: 'America/Sao_Paulo', label: 'São Paulo' },
  { zone: 'America/New_York', label: 'New York' },
  { zone: 'America/Chicago', label: 'Chicago' },
  { zone: 'America/Los_Angeles', label: 'Los Angeles' },
]

export const MAX_WORLD_CITIES = 8

/** Wall-clock time in [zone] at [at], like 14:05. */
export function timeIn(zone: string, at: number): string {
  return new Intl.DateTimeFormat('nl-BE', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)
}

/** Minutes [zone] is ahead of UTC at [at]. */
export function zoneOffsetMinutes(zone: string, at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(at)
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'))
  return Math.round((asUtc - Math.floor(at / 60000) * 60000) / 60000)
}

/** How [zone] differs from [home], like "+6 u", "−5 u 30", "zelfde tijd". */
export function offsetLabel(zone: string, home: string, at: number): string {
  const diff = zoneOffsetMinutes(zone, at) - zoneOffsetMinutes(home, at)
  if (diff === 0) return 'zelfde tijd'
  const sign = diff > 0 ? '+' : '−'
  const h = Math.floor(Math.abs(diff) / 60)
  const m = Math.abs(diff) % 60
  return `${sign}${h} u${m ? ` ${String(m).padStart(2, '0')}` : ''}`
}

/** Whether [zone] is on another date than [home] at [at]: "morgen", "gisteren" or "". */
export function zoneDayLabel(zone: string, home: string, at: number): string {
  const d = (z: string) => new Intl.DateTimeFormat('en-CA', { timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  const a = d(zone)
  const b = d(home)
  return a === b ? '' : a > b ? 'morgen' : 'gisteren'
}

/** A duration in ms as 1:02:03, 2:03 or, with [tenths], 2:03,4. */
export function formatDuration(ms: number, tenths = false): string {
  const total = Math.max(0, ms)
  const s = Math.floor(total / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const base = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
  return tenths ? `${base},${Math.floor((total % 1000) / 100)}` : base
}

// Timer and stopwatch: kept as start times, so they keep running while the window is closed.

export interface TimerState {
  /** Length chosen, in ms. */
  duration: number
  /** When it ends while running, or null. */
  endsAt: number | null
  /** What was left when paused, or null. */
  pausedLeft: number | null
}

export interface StopwatchState {
  /** When it started, minus time already counted before a pause; null when stopped. */
  startedAt: number | null
  /** Counted time while paused. */
  elapsed: number
  /** Lap totals in ms, newest last. */
  laps: number[]
}

export const MAX_LAPS = 99

export function timerLeft(t: TimerState, now: number): number {
  if (t.endsAt !== null) return Math.max(0, t.endsAt - now)
  return t.pausedLeft ?? t.duration
}

export function stopwatchElapsed(s: StopwatchState, now: number): number {
  return s.startedAt !== null ? s.elapsed + (now - s.startedAt) : s.elapsed
}

export function startCountdown(t: TimerState, now: number): TimerState {
  const left = t.pausedLeft ?? t.duration
  return left > 0 ? { ...t, endsAt: now + left, pausedLeft: null } : t
}

export function pauseCountdown(t: TimerState, now: number): TimerState {
  return t.endsAt === null ? t : { ...t, endsAt: null, pausedLeft: Math.max(0, t.endsAt - now) }
}

export function startStopwatch(s: StopwatchState, now: number): StopwatchState {
  return s.startedAt !== null ? s : { ...s, startedAt: now }
}

export function pauseStopwatch(s: StopwatchState, now: number): StopwatchState {
  return s.startedAt === null ? s : { ...s, startedAt: null, elapsed: s.elapsed + (now - s.startedAt) }
}

export function lap(s: StopwatchState, now: number): StopwatchState {
  if (s.startedAt === null || s.laps.length >= MAX_LAPS) return s
  return { ...s, laps: [...s.laps, stopwatchElapsed(s, now)] }
}

/** Each lap's own time, from the lap totals. */
export function lapTimes(laps: number[]): number[] {
  return laps.map((t, i) => t - (i === 0 ? 0 : laps[i - 1]))
}

// Alarms: reminders whose title starts with this, repeated daily or weekly, sent to phone and watch.
export const ALARM_PREFIX = 'Wekker'

export function isAlarmTitle(title: string): boolean {
  return title === ALARM_PREFIX || title.startsWith(`${ALARM_PREFIX}: `)
}

export function alarmTitle(label: string): string {
  const l = label.trim()
  return l ? `${ALARM_PREFIX}: ${l}` : ALARM_PREFIX
}

/** The next moment [hh:mm] local time comes, from [now]. */
export function nextAlarmAt(time: string, now: number): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  const d = new Date(now)
  d.setHours(h, min, 0, 0)
  if (d.getTime() <= now) d.setDate(d.getDate() + 1)
  return d.getTime()
}
