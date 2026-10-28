/**
 * Lessons from a school calendar link (an .ics export, like the "Koppel agenda" link on the AP
 * intranet that KlasHub also reads). Pure parsing; fetching happens in the app.
 */

/** One timed event from the calendar. Times are UTC milliseconds. */
export interface CalendarEvent {
  start: number
  end: number
  subject: string
  room?: string
}

/** Times without a zone or Z are local time at school. */
export const SCHOOL_TIME_ZONE = 'Europe/Brussels'
/** How far ahead lessons are kept after a sync. */
export const CALENDAR_DAYS_AHEAD = 28
/** Hosts a calendar link may point to; the AP intranet export by default. */
export const CALENDAR_HOSTS = ['apih.ap.be']

/** The link if it is an https calendar link on an allowed host, else null. */
export function calendarUrl(text: string, hosts: string[] = CALENDAR_HOSTS): string | null {
  let url: URL
  try {
    url = new URL(text.trim().replace(/^webcal:/i, 'https:'))
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  if (!hosts.includes(url.hostname.toLowerCase())) return null
  return url.href.length <= 500 ? url.href : null
}

/** Google Agenda's "secret address in iCal format" lives here. */
export const GOOGLE_CALENDAR_HOST = 'calendar.google.com'

/** The link if it is a Google Agenda iCal address (Settings, the calendar, "Secret address in iCal format"). */
export function googleCalendarUrl(text: string): string | null {
  const url = calendarUrl(text, [GOOGLE_CALENDAR_HOST])
  if (!url) return null
  const { pathname } = new URL(url)
  return pathname.startsWith('/calendar/ical/') && pathname.endsWith('.ics') ? url : null
}

/** UTC milliseconds of a wall-clock time in [timeZone]; correct across summer and winter time. */
function zonedTime(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(guess))
  const p = Object.fromEntries(parts.map((x) => [x.type, Number(x.value)]))
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess
  return guess - offset
}

/** A wall-clock time with its zone; zone null means UTC (a time ending in Z). */
interface WallTime {
  y: number
  mo: number
  d: number
  h: number
  mi: number
  s: number
  zone: string | null
}

function wallTime(params: string, value: string): WallTime | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value.trim())
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number)
  const zone = m[7] ? null : /TZID=([^;:]+)/i.exec(params)?.[1]?.replace(/^"|"$/g, '') || SCHOOL_TIME_ZONE
  return { y, mo, d, h, mi, s, zone }
}

function toTime(t: WallTime): number {
  if (t.zone === null) return Date.UTC(t.y, t.mo - 1, t.d, t.h, t.mi, t.s)
  try {
    return zonedTime(t.y, t.mo, t.d, t.h, t.mi, t.s, t.zone)
  } catch {
    // An unknown zone name (some exports use Windows names): fall back to school time.
    return zonedTime(t.y, t.mo, t.d, t.h, t.mi, t.s, SCHOOL_TIME_ZONE)
  }
}

/** Reads a DTSTART/DTEND line; null for all-day dates, which are not lessons. */
function parseTime(params: string, value: string): number | null {
  const t = wallTime(params, value)
  return t && toTime(t)
}

function unescape(text: string): string {
  return text
    .replace(/\\n/gi, ' ')
    .replace(/\\([,;\\])/g, '$1')
    .trim()
}

type Props = Record<string, { params: string; value: string }[]>
const first = (p: Props, name: string) => p[name]?.[0]

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
/** Enough for years of a daily event; the search stops at [to] long before that. */
const MAX_STEPS = 3000

/**
 * The start times of a repeating event (RRULE): daily, weekly (also on several days), monthly on the
 * same date and yearly, with INTERVAL, COUNT and UNTIL. Rules it does not know give only the first time.
 */
function occurrences(start: WallTime, rule: string, to: number): number[] {
  const parts = Object.fromEntries(rule.split(';').map((p) => p.split('=') as [string, string]))
  const freq = parts.FREQ
  const interval = Math.max(1, Number(parts.INTERVAL) || 1)
  const count = parts.COUNT ? Number(parts.COUNT) : Infinity
  const untilWall = parts.UNTIL ? wallTime(parts.UNTIL.endsWith('Z') ? '' : start.zone ? `TZID=${start.zone}` : '', parts.UNTIL.length === 8 ? `${parts.UNTIL}T235959` : parts.UNTIL) : null
  const until = untilWall ? toTime(untilWall) : Infinity
  const byDay = parts.BYDAY ? parts.BYDAY.split(',') : []
  const firstAt = toTime(start)
  const simple = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq) && (byDay.length === 0 || (freq === 'WEEKLY' && byDay.every((d) => WEEKDAYS.includes(d))))
  if (!simple || parts.BYMONTHDAY || parts.BYMONTH || parts.BYSETPOS) return [firstAt]

  const at = (dayOffset: number, months = 0) => {
    // Calendar arithmetic on the date only; the wall-clock time stays, so summer time is right.
    const date = new Date(Date.UTC(start.y, start.mo - 1 + months, start.d + dayOffset))
    if (months && date.getUTCDate() !== start.d) return null // e.g. the 31st in a shorter month
    return toTime({ ...start, y: date.getUTCFullYear(), mo: date.getUTCMonth() + 1, d: date.getUTCDate() })
  }
  const out: number[] = []
  const startDay = new Date(Date.UTC(start.y, start.mo - 1, start.d)).getUTCDay()
  const days = freq === 'WEEKLY' && byDay.length > 0 ? byDay.map((d) => WEEKDAYS.indexOf(d)) : [startDay]
  for (let step = 0; step < MAX_STEPS && out.length < count; step++) {
    let candidates: (number | null)[]
    if (freq === 'DAILY') candidates = [at(step * interval)]
    else if (freq === 'WEEKLY') {
      // Weeks start on Monday, as in most calendars; days before the first start are skipped.
      const monday = step * 7 * interval - ((startDay + 6) % 7)
      candidates = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((wd) => at(monday + ((wd + 6) % 7)))
    } else candidates = [at(0, step * interval * (freq === 'YEARLY' ? 12 : 1))]
    for (const t of candidates) {
      if (t === null || t < firstAt) continue
      if (t > until || t >= to || out.length >= count) return out
      out.push(t)
    }
  }
  return out
}

/**
 * The timed events between [from] and [to], sorted by start. Repeating events (as in Google Agenda)
 * are expanded, with skipped (EXDATE) and moved (RECURRENCE-ID) times; cancelled events are left out.
 */
export function parseIcs(ics: string, from: number, to: number): CalendarEvent[] {
  const lines = ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
  const vevents: Props[] = []
  let current: Props | null = null
  // Inside a VEVENT, an alarm (VALARM) has lines of its own, such as its own SUMMARY.
  let nested = 0
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = {}
    else if (line === 'END:VEVENT' && current) {
      vevents.push(current)
      current = null
      nested = 0
    } else if (current && line.startsWith('BEGIN:')) nested++
    else if (current && line.startsWith('END:')) nested = Math.max(0, nested - 1)
    else if (current && nested === 0) {
      const colon = line.indexOf(':')
      if (colon < 0) continue
      const head = line.slice(0, colon)
      const semi = head.indexOf(';')
      const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase()
      ;(current[name] ??= []).push({ params: semi < 0 ? '' : head.slice(semi + 1), value: line.slice(colon + 1) })
    }
  }

  // Times of a repeating event that another VEVENT moved or cancelled, per UID.
  const replaced = new Map<string, Set<number>>()
  for (const e of vevents) {
    const id = first(e, 'RECURRENCE-ID')
    const uid = first(e, 'UID')?.value
    const t = id && parseTime(id.params, id.value)
    if (uid && t) replaced.set(uid, (replaced.get(uid) ?? new Set()).add(t))
  }

  const events: CalendarEvent[] = []
  for (const e of vevents) {
    if (first(e, 'STATUS')?.value.trim().toUpperCase() === 'CANCELLED') continue
    const dtstart = first(e, 'DTSTART')
    const startWall = dtstart && wallTime(dtstart.params, dtstart.value)
    if (!startWall) continue
    const start = toTime(startWall)
    const dtend = first(e, 'DTEND')
    const end = dtend ? parseTime(dtend.params, dtend.value) : start
    const subject = unescape(first(e, 'SUMMARY')?.value ?? '').slice(0, 200)
    if (!end || end < start || !subject) continue
    const room = unescape(first(e, 'LOCATION')?.value ?? '').slice(0, 100)
    const rule = first(e, 'RRULE')?.value
    let starts = [start]
    if (rule && !first(e, 'RECURRENCE-ID')) {
      const skip = new Set(replaced.get(first(e, 'UID')?.value ?? '') ?? [])
      for (const ex of e.EXDATE ?? []) {
        for (const v of ex.value.split(',')) {
          const t = parseTime(ex.params, v)
          if (t) skip.add(t)
        }
      }
      starts = occurrences(startWall, rule, to).filter((t) => !skip.has(t))
    }
    for (const s of starts) {
      const e2 = s + (end - start)
      if (e2 > from && s < to) events.push({ start: s, end: e2, subject, ...(room ? { room } : {}) })
    }
  }
  return events.sort((a, b) => a.start - b.start).slice(0, 500)
}

/** The lesson running now or coming next. */
export function nextCalendarEvent(events: CalendarEvent[], at: number): CalendarEvent | null {
  let best: CalendarEvent | null = null
  for (const e of events) if (e.end > at && (!best || e.start < best.start)) best = e
  return best
}

export function isCalendarEvent(value: unknown): value is CalendarEvent {
  const e = value as CalendarEvent
  return (
    typeof e === 'object' &&
    e !== null &&
    Number.isFinite(e.start) &&
    Number.isFinite(e.end) &&
    typeof e.subject === 'string' &&
    (e.room === undefined || typeof e.room === 'string')
  )
}
