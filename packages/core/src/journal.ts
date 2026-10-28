/**
 * Dagboek: one entry per day with your mood (1–5) and a short note. Pure logic; the entries sync
 * as one document per account, entry by entry (the newer change of a day wins).
 */
import { dateKey } from './habits'

export type Mood = 1 | 2 | 3 | 4 | 5

export interface JournalEntry {
  /** The day, YYYY-MM-DD; also the id, so two devices write the same day into one entry. */
  date: string
  mood: Mood | null
  note: string
  updatedAt: number
  deletedAt: number | null
}

export interface JournalState {
  entries: JournalEntry[]
  revision: number
}

export const MOODS: Array<{ value: Mood; emoji: string; label: string }> = [
  { value: 1, emoji: '😞', label: 'Slecht' },
  { value: 2, emoji: '😕', label: 'Matig' },
  { value: 3, emoji: '😐', label: 'Oké' },
  { value: 4, emoji: '🙂', label: 'Goed' },
  { value: 5, emoji: '😄', label: 'Super' },
]
export const MAX_JOURNAL_NOTE = 4000
const MAX_ENTRIES = 3000
const DATE = /^\d{4}-\d{2}-\d{2}$/

export const emptyJournal = (): JournalState => ({ entries: [], revision: 0 })

export function parseJournalEntry(raw: unknown): JournalEntry | null {
  if (typeof raw !== 'object' || raw === null) return null
  const e = raw as Partial<JournalEntry>
  if (typeof e.date !== 'string' || !DATE.test(e.date) || typeof e.updatedAt !== 'number') return null
  const mood = typeof e.mood === 'number' && Number.isInteger(e.mood) && e.mood >= 1 && e.mood <= 5 ? (e.mood as Mood) : null
  return { date: e.date, mood, note: typeof e.note === 'string' ? e.note.slice(0, MAX_JOURNAL_NOTE) : '', updatedAt: e.updatedAt, deletedAt: typeof e.deletedAt === 'number' ? e.deletedAt : null }
}

export function parseJournalState(raw: unknown): JournalState {
  if (typeof raw !== 'object' || raw === null) return emptyJournal()
  const r = raw as Partial<JournalState>
  return {
    entries: Array.isArray(r.entries) ? r.entries.map(parseJournalEntry).filter((e): e is JournalEntry => e !== null).slice(-MAX_ENTRIES) : [],
    revision: typeof r.revision === 'number' ? r.revision : 0,
  }
}

export function mergeJournal(a: JournalState, b: JournalState): JournalState {
  const byDate = new Map(a.entries.map((e) => [e.date, e]))
  for (const e of b.entries) {
    const mine = byDate.get(e.date)
    if (!mine || e.updatedAt > mine.updatedAt) byDate.set(e.date, e)
  }
  return { entries: [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date)), revision: Math.max(a.revision, b.revision) }
}

/** The written entries, newest first. */
export const journalEntries = (s: JournalState) =>
  s.entries.filter((e) => e.deletedAt === null && (e.mood !== null || e.note.trim() !== '')).sort((a, b) => b.date.localeCompare(a.date))

export const entryOn = (s: JournalState, day: string) => s.entries.find((e) => e.date === day && e.deletedAt === null) ?? null

/** Days in a row with an entry, up to today (or up to yesterday when today has none yet). */
export function journalStreak(s: JournalState, now: number): number {
  const written = new Set(journalEntries(s).map((e) => e.date))
  const d = new Date(now)
  if (!written.has(dateKey(d.getTime()))) d.setDate(d.getDate() - 1)
  let n = 0
  while (written.has(dateKey(d.getTime()))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export interface MoodWeek {
  /** Monday of the week, YYYY-MM-DD. */
  monday: string
  /** Average mood, one decimal, or null without moods that week. */
  average: number | null
  days: number
}

/** Average mood per week, the last [count] weeks, oldest first. */
export function moodWeeks(s: JournalState, now: number, count = 8): MoodWeek[] {
  const today = new Date(now)
  today.setHours(12, 0, 0, 0)
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const entries = journalEntries(s)
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(monday)
    start.setDate(monday.getDate() - (count - 1 - i) * 7)
    const end = new Date(start)
    end.setDate(start.getDate() + 7)
    const [from, to] = [dateKey(start.getTime()), dateKey(end.getTime())]
    const moods = entries.filter((e) => e.date >= from && e.date < to && e.mood !== null).map((e) => e.mood!)
    return { monday: from, average: moods.length ? Math.round((moods.reduce((n, m) => n + m, 0) / moods.length) * 10) / 10 : null, days: moods.length }
  })
}

export const moodEmoji = (mood: number | null) => (mood === null ? '·' : (MOODS[Math.min(4, Math.max(0, Math.round(mood) - 1))].emoji))
