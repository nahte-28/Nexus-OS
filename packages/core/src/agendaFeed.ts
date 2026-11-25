import type { CalendarEvent } from './calendar'
import { appointmentsOf, deadlinesOf, type LifeItem } from './life'
import type { Lesson } from './profiles'
import { occurrences, wallDate } from './recurrence'

/**
 * Agenda in Google: NEXUS writes your lessons (and if you like your NEXUS appointments and
 * deadlines) as an .ics calendar. A device builds it with the local clock, the server only keeps
 * the text, and Google Agenda reads it through a secret link (api/agenda-feed.ts). What already
 * stands in your Google Agenda (or another linked calendar) is left out, so it only adds what is
 * missing there.
 */

export interface AgendaFeedOptions {
  appointments: boolean
  deadlines: boolean
}

export const DEFAULT_FEED_OPTIONS: AgendaFeedOptions = { appointments: true, deadlines: false }

export interface AgendaFeedInput {
  /** Lessons from the school calendar; when there are any, they replace the typed-in timetable. */
  calendarEvents: CalendarEvent[]
  timetable: Lesson[]
  items: LifeItem[]
  /** Events that came from Google Agenda and the other linked calendars: never sent back. */
  linked: CalendarEvent[]
}

const DAY = 24 * 60 * 60_000
/** How far back the new feed starts; older events come from the previous feed (see keepPast). */
const BACK_MS = DAY
/** The typed-in weekly timetable is written out this far ahead. */
const TIMETABLE_DAYS = 26 * 7
/** NEXUS appointments and deadlines this far ahead. */
const AHEAD_MS = 365 * DAY
/** Events that are over stay in Google this long, taken from the previous feed. */
export const KEEP_PAST_MS = 90 * DAY
/** At most this many events; far below what the server and Google accept. */
const MAX_EVENTS = 3000

interface FeedEvent {
  uid: string
  start: number
  end: number
  title: string
  location?: string
  description?: string
}

/** 20261125T083000Z */
export function icsTime(t: number): string {
  return new Date(Math.floor(t / 1000) * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Text as an iCalendar value: backslash, semicolon, comma and line breaks escaped. */
export function icsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Long lines are folded at 75 bytes, as the standard asks; never inside a character. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const size = encoder.encode(ch).length
    const limit = parts.length === 0 ? 75 : 74
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'les'

const MINUTE = 60_000
const sameTitle = (a: string, b: string) => {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  return x.length > 0 && y.length > 0 && (x === y || x.includes(y) || y.includes(x))
}

/**
 * Whether [e] already stands in a linked calendar: one that starts the same minute and either ends
 * the same minute or carries the same name (a lesson called "Wiskunde" in one and "Wiskunde - B12"
 * in the other counts as the same).
 */
export function alreadyLinked(e: { start: number; end: number; title: string }, linked: CalendarEvent[]): boolean {
  return linked.some((l) => Math.abs(l.start - e.start) < MINUTE && (Math.abs(l.end - e.end) < MINUTE || sameTitle(l.subject, e.title)))
}

/** UTC ms of HH:MM on the local day [day] (a local midnight). */
function atTime(day: Date, time: string): number {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

/** Everything the feed holds from just before [now] on, already without what Google has. */
export function feedEvents(input: AgendaFeedInput, options: AgendaFeedOptions, now: number): FeedEvent[] {
  const from = now - BACK_MS
  const out: FeedEvent[] = []
  if (input.calendarEvents.length > 0) {
    for (const e of input.calendarEvents) {
      if (e.end <= from || e.end <= e.start) continue
      out.push({ uid: `les-${icsTime(e.start)}-${slug(e.subject)}@nexus-os`, start: e.start, end: e.end, title: e.subject, ...(e.room ? { location: e.room } : {}) })
    }
  } else if (input.timetable.length > 0) {
    const day = new Date(now)
    day.setHours(0, 0, 0, 0)
    for (let i = 0; i < TIMETABLE_DAYS; i++) {
      const weekday = ((day.getDay() + 6) % 7) + 1
      for (const l of input.timetable) {
        if (l.day !== weekday) continue
        const start = atTime(day, l.start)
        const end = atTime(day, l.end)
        if (end > start) out.push({ uid: `rooster-${l.id}-${wallDate(start)}@nexus-os`, start, end, title: l.subject, ...(l.room ? { location: l.room } : {}) })
      }
      day.setDate(day.getDate() + 1)
    }
  }
  if (options.appointments) {
    for (const a of appointmentsOf(input.items)) {
      for (const o of occurrences(a, from, now + AHEAD_MS)) {
        out.push({
          uid: `afspraak-${a.id}-${o.date}@nexus-os`,
          start: o.startAt,
          end: Math.max(o.endAt, o.startAt + 15 * MINUTE),
          title: a.title,
          ...(a.location ? { location: a.location } : {}),
          ...(a.notes ? { description: a.notes } : {}),
        })
      }
    }
  }
  if (options.deadlines) {
    for (const d of deadlinesOf(input.items)) {
      if (d.doneAt !== null || d.dueAt < from || d.dueAt > now + AHEAD_MS) continue
      out.push({ uid: `deadline-${d.id}@nexus-os`, start: d.dueAt, end: d.dueAt + 15 * MINUTE, title: `Deadline: ${d.title}`, ...(d.notes ? { description: d.notes } : {}) })
    }
  }
  const seen = new Set<string>()
  return out
    .filter((e) => !alreadyLinked(e, input.linked))
    .filter((e) => (seen.has(e.uid) ? false : (seen.add(e.uid), true)))
    .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title))
}

function eventBlock(e: FeedEvent): string {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    // Fixed, so every device writes exactly the same feed and nothing is uploaded without a change.
    'DTSTAMP:20260101T000000Z',
    `DTSTART:${icsTime(e.start)}`,
    `DTEND:${icsTime(e.end)}`,
    `SUMMARY:${icsText(e.title)}`,
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${icsText(e.description.slice(0, 2000))}`] : []),
    'END:VEVENT',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/**
 * The events of the previous feed that are over by now (before the new feed starts) and not older
 * than [KEEP_PAST_MS], so lessons you had stay visible in Google instead of disappearing a day later.
 */
export function keepPast(previous: string, now: number, uids: Set<string>): string[] {
  const kept: string[] = []
  for (const block of previous.match(/BEGIN:VEVENT\r?\n[\s\S]*?END:VEVENT\r?\n?/g) ?? []) {
    const unfolded = block.replace(/\r?\n[ \t]/g, '')
    const uid = /^UID:(.*)$/m.exec(unfolded)?.[1]?.trim()
    const end = /^DTEND:(\d{8}T\d{6}Z)\s*$/m.exec(unfolded)?.[1]
    if (!uid || !end || uids.has(uid)) continue
    const at = Date.UTC(+end.slice(0, 4), +end.slice(4, 6) - 1, +end.slice(6, 8), +end.slice(9, 11), +end.slice(11, 13), +end.slice(13, 15))
    if (at <= now - BACK_MS && at > now - KEEP_PAST_MS) kept.push(block.endsWith('\n') ? block.replace(/\r?\n$/, '\r\n') : block + '\r\n')
  }
  return kept
}

/** The whole .ics text Google Agenda reads. [previous] is the feed as it was, to keep past events. */
export function buildAgendaFeed(input: AgendaFeedInput, options: AgendaFeedOptions, now: number, previous = ''): string {
  const events = feedEvents(input, options, now)
  const uids = new Set(events.map((e) => e.uid))
  const blocks = [...keepPast(previous, now, uids), ...events.map(eventBlock)].slice(-MAX_EVENTS)
  return [
    'BEGIN:VCALENDAR\r\n',
    'VERSION:2.0\r\n',
    'PRODID:-//NEXUS OS//Agenda in Google//NL\r\n',
    'CALSCALE:GREGORIAN\r\n',
    'METHOD:PUBLISH\r\n',
    'X-WR-CALNAME:NEXUS\r\n',
    'X-WR-CALDESC:Lessen en afspraken uit NEXUS die nog niet in je Google Agenda stonden\r\n',
    'X-PUBLISHED-TTL:PT1H\r\n',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n',
    ...blocks,
    'END:VCALENDAR\r\n',
  ].join('')
}

/** A new secret for the link: 32 random bytes, base64url (43 characters). */
export function newFeedToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let text = ''
  for (const b of bytes) text += String.fromCharCode(b)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const FEED_TOKEN = /^[A-Za-z0-9_-]{32,64}$/

/** The address Google Agenda subscribes to. */
export function feedUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/api/agenda-feed?t=${token}`
}
