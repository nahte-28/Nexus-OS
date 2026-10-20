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

/** Reads a DTSTART/DTEND line; null for all-day dates, which are not lessons. */
function parseTime(params: string, value: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value.trim())
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number)
  if (m[7]) return Date.UTC(y, mo - 1, d, h, mi, s)
  const zone = /TZID=([^;:]+)/i.exec(params)?.[1]?.replace(/^"|"$/g, '')
  try {
    return zonedTime(y, mo, d, h, mi, s, zone || SCHOOL_TIME_ZONE)
  } catch {
    // An unknown zone name (some exports use Windows names): fall back to school time.
    return zonedTime(y, mo, d, h, mi, s, SCHOOL_TIME_ZONE)
  }
}

function unescape(text: string): string {
  return text
    .replace(/\\n/gi, ' ')
    .replace(/\\([,;\\])/g, '$1')
    .trim()
}

/** The timed events between [from] and [to], sorted by start. Repeating rules are not expanded. */
export function parseIcs(ics: string, from: number, to: number): CalendarEvent[] {
  const lines = ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
  const events: CalendarEvent[] = []
  let current: Record<string, { params: string; value: string }> | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = {}
    else if (line === 'END:VEVENT' && current) {
      const start = current.DTSTART && parseTime(current.DTSTART.params, current.DTSTART.value)
      const end = current.DTEND ? parseTime(current.DTEND.params, current.DTEND.value) : start
      const subject = unescape(current.SUMMARY?.value ?? '').slice(0, 200)
      if (start && end && end >= start && end > from && start < to && subject) {
        const room = unescape(current.LOCATION?.value ?? '').slice(0, 100)
        events.push({ start, end, subject, ...(room ? { room } : {}) })
      }
      current = null
    } else if (current) {
      const colon = line.indexOf(':')
      if (colon < 0) continue
      const head = line.slice(0, colon)
      const semi = head.indexOf(';')
      const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase()
      current[name] = { params: semi < 0 ? '' : head.slice(semi + 1), value: line.slice(colon + 1) }
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
