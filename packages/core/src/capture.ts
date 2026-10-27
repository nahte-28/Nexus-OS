/**
 * Snelle notitie: one line of text, typed or shared from the phone, that becomes a note, a deadline
 * or a reminder. This file finds a Dutch date and time in the text ("vrijdag", "morgen om 14u",
 * "3/11 9:30") and cleans the title.
 */

export type CaptureKind = 'note' | 'deadline' | 'reminder'

export const CAPTURE_KIND_LABELS: Record<CaptureKind, string> = { note: 'Notitie', deadline: 'Deadline', reminder: 'Herinnering' }

export interface Capture {
  kind: CaptureKind
  /** First line, without the date words. */
  title: string
  /** The rest of the text. */
  body: string
  /** The moment found in the text, or the default for the kind; null for a note. */
  at: number | null
  /** True when [at] came from the text. */
  found: boolean
}

const DAY = 24 * 60 * 60_000
const WEEKDAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const addDays = (dayStart: number, n: number) => startOfDay(dayStart + n * DAY + 3_600_000)
const at = (dayStart: number, h: number, m: number) => new Date(dayStart).setHours(h, m, 0, 0)

interface Found {
  day: number | null
  time: { h: number; m: number } | null
  rest: string
}

/** Finds a day and a time in [text] and returns the text without them. */
function findMoment(text: string, now: number): Found {
  let rest = ` ${text} `
  let day: number | null = null
  let time: { h: number; m: number } | null = null
  const today = startOfDay(now)
  const take = (re: RegExp, use: (m: RegExpMatchArray) => boolean) => {
    const m = rest.match(re)
    if (m && use(m)) rest = rest.replace(m[0], ' ')
  }

  // Time first, so "9:30" is not read as a date: "om 14u", "14u30", "14:30", "om 9 uur".
  take(/\s(?:om\s+)?([01]?\d|2[0-3])(?::|u|h)([0-5]\d)\b/i, (m) => ((time = { h: Number(m[1]), m: Number(m[2]) }), true))
  if (!time) take(/\s(?:om\s+)?([01]?\d|2[0-3])\s?(?:u|uur|h)\b/i, (m) => ((time = { h: Number(m[1]), m: 0 }), true))
  if (!time) take(/\som\s+([01]?\d|2[0-3])\b/i, (m) => ((time = { h: Number(m[1]), m: 0 }), true))

  take(/\s(?:tegen\s+|op\s+)?(vandaag|vanavond|morgen|overmorgen)\b/i, (m) => {
    const word = m[1].toLowerCase()
    day = word === 'overmorgen' ? addDays(today, 2) : word === 'morgen' ? addDays(today, 1) : today
    if (word === 'vanavond' && !time) time = { h: 19, m: 0 }
    return true
  })
  if (day === null)
    take(/\s(?:tegen\s+|op\s+)?(?:volgende\s+)?(zondag|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag)\b/i, (m) => {
      const word = m[1].toLowerCase()
      const target = WEEKDAYS.indexOf(word)
      const ahead = (target - new Date(today).getDay() + 7) % 7
      // "vrijdag" on a Friday means next week's, unless a time later today is given.
      day = addDays(today, ahead === 0 && !(time && at(today, time.h, time.m) > now) ? 7 : ahead)
      if (/volgende/i.test(m[0]) && ahead !== 0) day = addDays(day, 7)
      return true
    })
  if (day === null)
    take(/\s(?:tegen\s+|op\s+)?(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?=\s)/, (m) => {
      const d = Number(m[1])
      const month = Number(m[2]) - 1
      if (d < 1 || d > 31 || month < 0 || month > 11) return false
      let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : new Date(now).getFullYear()
      let date = new Date(year, month, d).getTime()
      // A date without a year that already passed is next year's.
      if (!m[3] && date < today) date = new Date(++year, month, d).getTime()
      if (new Date(date).getDate() !== d) return false
      day = date
      return true
    })

  return { day, time, rest: rest.replace(/\s+/g, ' ').replace(/\s+([,.:;!?])/g, '$1').trim().replace(/^[,.:;-]\s*|\s*[,:;-]$/g, '') }
}

/** Reads a quick capture. Without a moment in the text, a deadline is tomorrow 23:59 and a reminder in an hour. */
export function parseCapture(text: string, kind: CaptureKind, now: number): Capture {
  const lines = text.replace(/\r/g, '').trim().split('\n')
  const first = lines[0]?.trim() ?? ''
  const body = lines.slice(1).join('\n').trim()
  if (kind === 'note') return { kind, title: first.slice(0, 200), body, at: null, found: false }

  const { day, time, rest } = findMoment(first, now)
  const title = (rest || first).slice(0, 200)
  const found = day !== null || time !== null
  let moment: number
  if (kind === 'deadline') {
    const base = day ?? (time && at(startOfDay(now), time.h, time.m) > now ? startOfDay(now) : addDays(startOfDay(now), 1))
    moment = time ? at(base, time.h, time.m) : at(base, 23, 59)
  } else if (day !== null) {
    moment = at(day, time?.h ?? 9, time?.m ?? 0)
  } else if (time) {
    const todayAt = at(startOfDay(now), time.h, time.m)
    moment = todayAt > now ? todayAt : at(addDays(startOfDay(now), 1), time.h, time.m)
  } else {
    moment = now + 60 * 60_000
  }
  return { kind, title, body, at: moment, found }
}

/** A guess at what was meant: a moment in the text makes it a reminder, else a note. */
export function guessCaptureKind(text: string, now: number): CaptureKind {
  const first = text.trim().split('\n')[0] ?? ''
  if (/^(deadline|indienen|inleveren|tegen)\b/i.test(first) || /\b(indienen|inleveren|deadline)\b/i.test(first)) return 'deadline'
  const { day, time } = findMoment(first, now)
  return day !== null || time !== null ? 'reminder' : 'note'
}

/** Text shared to NEXUS from another app (title, text and link of the Web Share Target). */
export function sharedText(params: URLSearchParams): string {
  const parts = [params.get('title'), params.get('text'), params.get('url')].map((p) => p?.trim() ?? '').filter(Boolean)
  // Many apps put the link in text as well; keep it once.
  return [...new Set(parts)].join('\n')
}
