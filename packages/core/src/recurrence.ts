/**
 * Smart Calendar: appointments that repeat, with dates to skip, and warnings when two things in
 * the agenda overlap. Times follow the wall clock of the device, so "every Monday at 10:00" stays
 * at 10:00 across the change to summer or winter time. Pure logic.
 */

export type RepeatFreq = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface AppointmentRepeat {
  freq: RepeatFreq
  /** Every [interval] days, weeks, months or years. */
  interval: number
  /** For weekly: ISO weekdays (1 = Monday). Empty means the weekday of the first appointment. */
  days: number[]
  /** Last local date (YYYY-MM-DD) with an appointment, inclusive; null repeats without end. */
  until: string | null
  /** Local dates (YYYY-MM-DD) skipped in the series. */
  except: string[]
}

export const REPEAT_FREQS: RepeatFreq[] = ['daily', 'weekly', 'monthly', 'yearly']
export const REPEAT_FREQ_LABELS: Record<RepeatFreq, string> = { daily: 'Elke dag', weekly: 'Elke week', monthly: 'Elke maand', yearly: 'Elk jaar' }
const UNIT: Record<RepeatFreq, string> = { daily: 'dagen', weekly: 'weken', monthly: 'maanden', yearly: 'jaar' }
export const WEEKDAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

export const MAX_INTERVAL = 52
const MAX_EXCEPT = 200
/** No series runs longer than this many steps from its first appointment (e.g. 30 years daily). */
const MAX_STEPS = 11_000
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** YYYY-MM-DD of [t] on the local wall clock. */
export function wallDate(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const isoDay = (d: Date) => ((d.getDay() + 6) % 7) + 1

/** Validates a stored, synced or typed-in repeat rule; null when it does not repeat. */
export function parseRepeat(value: unknown): AppointmentRepeat | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (!REPEAT_FREQS.includes(v.freq as RepeatFreq)) return null
  const interval = typeof v.interval === 'number' && Number.isInteger(v.interval) ? Math.min(Math.max(v.interval, 1), MAX_INTERVAL) : 1
  const days = Array.isArray(v.days) ? [...new Set(v.days.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))].sort() : []
  const until = typeof v.until === 'string' && DATE.test(v.until) ? v.until : null
  const except = Array.isArray(v.except) ? [...new Set(v.except.filter((d): d is string => typeof d === 'string' && DATE.test(d)))].sort().slice(-MAX_EXCEPT) : []
  return { freq: v.freq as RepeatFreq, interval, days: v.freq === 'weekly' ? days : [], until, except }
}

/** "Elke 2 weken op ma en wo, tot 20 dec." */
export function repeatLabel(repeat: AppointmentRepeat, startAt: number): string {
  let text = repeat.interval === 1 ? REPEAT_FREQ_LABELS[repeat.freq] : `Elke ${repeat.interval} ${UNIT[repeat.freq]}`
  if (repeat.freq === 'weekly') {
    const days = repeat.days.length > 0 ? repeat.days : [isoDay(new Date(startAt))]
    const names = days.map((d) => WEEKDAY_SHORT[d - 1])
    text += ` op ${names.length > 1 ? `${names.slice(0, -1).join(', ')} en ${names.at(-1)}` : names[0]}`
  }
  if (repeat.until) {
    const [y, m, d] = repeat.until.split('-').map(Number)
    text += `, tot ${new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d))}`
  }
  return text
}

export interface Occurrence {
  startAt: number
  endAt: number
  /** Local date of the start, which identifies the occurrence in [AppointmentRepeat.except]. */
  date: string
}

interface Repeating {
  startAt: number
  endAt: number
  repeat?: AppointmentRepeat | null
}

/**
 * The times [item] takes place that overlap [from, to): one for a plain appointment, every one of
 * the series for a repeating one (skipped dates left out). An appointment that runs into [from]
 * counts too, so a trip over several days shows on each of them.
 */
export function occurrences(item: Repeating, from: number, to: number, limit = 500): Occurrence[] {
  const length = Math.max(item.endAt - item.startAt, 0)
  const overlaps = (s: number) => s < to && (s + length > from || s >= from)
  const repeat = item.repeat
  if (!repeat) return overlaps(item.startAt) ? [{ startAt: item.startAt, endAt: item.endAt, date: wallDate(item.startAt) }] : []
  const first = new Date(item.startAt)
  const [h, mi, sec] = [first.getHours(), first.getMinutes(), first.getSeconds()]
  const except = new Set(repeat.except)
  const out: Occurrence[] = []
  const add = (y: number, m: number, d: number, sameDay = false) => {
    const at = new Date(y, m, d, h, mi, sec)
    // Monthly and yearly: a day that does not exist in that month (31 April) rolls over in Date, so skip it.
    if (sameDay && at.getDate() !== d) return true
    const date = wallDate(at.getTime())
    if (repeat.until && date > repeat.until) return false
    const s = at.getTime()
    if (s >= to) return false
    if (s >= item.startAt && !except.has(date) && overlaps(s)) out.push({ startAt: s, endAt: s + length, date })
    return out.length < limit
  }
  const [y0, m0, d0] = [first.getFullYear(), first.getMonth(), first.getDate()]
  // Jump close to [from] first, so a long series does not walk every step from its start.
  const skipDays = Math.max(0, Math.floor((from - length - item.startAt) / 86_400_000) - 2)
  if (repeat.freq === 'daily') {
    const step0 = Math.floor(skipDays / repeat.interval)
    for (let i = step0; i < step0 + MAX_STEPS; i++) if (!add(y0, m0, d0 + i * repeat.interval)) break
  } else if (repeat.freq === 'weekly') {
    const days = repeat.days.length > 0 ? repeat.days : [isoDay(first)]
    const monday = d0 - (isoDay(first) - 1)
    const week0 = Math.floor(skipDays / 7 / repeat.interval)
    outer: for (let w = week0; w < week0 + MAX_STEPS; w++) {
      for (const day of days) if (!add(y0, m0, monday + w * 7 * repeat.interval + day - 1)) break outer
    }
  } else {
    const months = repeat.freq === 'monthly' ? repeat.interval : repeat.interval * 12
    const step0 = Math.floor(skipDays / 31 / months)
    for (let i = step0; i < step0 + MAX_STEPS / 10; i++) if (!add(y0, m0 + i * months, d0, true)) break
  }
  return out
}

/** The first time [item] takes place that has not ended at [now], or null when the series is over. */
export function nextOccurrence(item: Repeating, now: number): Occurrence | null {
  if (!item.repeat) return item.endAt >= now ? { startAt: item.startAt, endAt: item.endAt, date: wallDate(item.startAt) } : null
  // Two years ahead covers every rule, a yearly one included.
  return occurrences(item, now, now + 2 * 366 * 86_400_000, 1)[0] ?? null
}

export interface Timed {
  at: number
  end: number
  title: string
}

/** For each entry, the titles of the other entries that overlap it (touching end to start is fine). */
export function overlapsOf<T extends Timed>(entries: T[]): Map<T, string[]> {
  const out = new Map<T, string[]>()
  const sorted = entries.filter((e) => e.end > e.at).sort((a, b) => a.at - b.at)
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].at < sorted[i].end; j++) {
      out.set(sorted[i], [...(out.get(sorted[i]) ?? []), sorted[j].title])
      out.set(sorted[j], [...(out.get(sorted[j]) ?? []), sorted[i].title])
    }
  }
  return out
}
