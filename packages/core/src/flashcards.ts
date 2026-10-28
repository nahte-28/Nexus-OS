/**
 * Leerkaarten: flashcards in decks, asked again on a growing schedule (spaced repetition, in the
 * spirit of SM-2): a card you know comes back after 1, 3, 8, 20… days, one you forgot the same day.
 */

export interface Deck {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface Flashcard {
  id: string
  deckId: string
  front: string
  back: string
  /** When it should be asked next, epoch ms. */
  due: number
  /** Days until the next time after a correct answer; 0 for a new or forgotten card. */
  interval: number
  /** How fast the interval grows, 1.3–3. */
  ease: number
  /** Correct answers in a row. */
  reps: number
  /** Times it was forgotten. */
  lapses: number
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface FlashcardsState {
  decks: Deck[]
  cards: Flashcard[]
  revision: number
}

export type CardGrade = 'again' | 'hard' | 'good' | 'easy'

export const GRADE_LABELS: Record<CardGrade, string> = { again: 'Opnieuw', hard: 'Moeilijk', good: 'Goed', easy: 'Makkelijk' }

const DAY = 24 * 60 * 60_000
/** A forgotten card comes back in the same session. */
const AGAIN_MS = 10 * 60_000
const START_EASE = 2.5
const MIN_EASE = 1.3
const MAX_EASE = 3
const MAX_DECKS = 100
const MAX_CARDS = 3000
export const MAX_CARD_TEXT = 1000

export const emptyFlashcards = (): FlashcardsState => ({ decks: [], cards: [], revision: 0 })

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
/** The local midnight [n] days from [dayStart]; +1 hour keeps it right across a time change. */
const shiftDay = (dayStart: number, n: number) => startOfDay(dayStart + n * DAY + 3_600_000)
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export function parseDeck(raw: unknown): Deck | null {
  if (typeof raw !== 'object' || raw === null) return null
  const d = raw as Partial<Deck>
  if (typeof d.id !== 'string' || typeof d.name !== 'string' || typeof d.updatedAt !== 'number') return null
  return {
    id: d.id,
    name: d.name.slice(0, 80),
    createdAt: num(d.createdAt, d.updatedAt),
    updatedAt: d.updatedAt,
    deletedAt: typeof d.deletedAt === 'number' ? d.deletedAt : null,
  }
}

export function parseFlashcard(raw: unknown): Flashcard | null {
  if (typeof raw !== 'object' || raw === null) return null
  const c = raw as Partial<Flashcard>
  if (typeof c.id !== 'string' || typeof c.deckId !== 'string' || typeof c.front !== 'string' || typeof c.back !== 'string' || typeof c.updatedAt !== 'number') return null
  return {
    id: c.id,
    deckId: c.deckId,
    front: c.front.slice(0, MAX_CARD_TEXT),
    back: c.back.slice(0, MAX_CARD_TEXT),
    due: num(c.due, c.updatedAt),
    interval: Math.max(0, num(c.interval, 0)),
    ease: Math.min(MAX_EASE, Math.max(MIN_EASE, num(c.ease, START_EASE))),
    reps: Math.max(0, Math.floor(num(c.reps, 0))),
    lapses: Math.max(0, Math.floor(num(c.lapses, 0))),
    createdAt: num(c.createdAt, c.updatedAt),
    updatedAt: c.updatedAt,
    deletedAt: typeof c.deletedAt === 'number' ? c.deletedAt : null,
  }
}

export function parseFlashcardsState(raw: unknown): FlashcardsState {
  if (typeof raw !== 'object' || raw === null) return emptyFlashcards()
  const r = raw as Partial<FlashcardsState>
  return {
    decks: Array.isArray(r.decks) ? r.decks.map(parseDeck).filter((d): d is Deck => d !== null).slice(0, MAX_DECKS) : [],
    cards: Array.isArray(r.cards) ? r.cards.map(parseFlashcard).filter((c): c is Flashcard => c !== null).slice(0, MAX_CARDS) : [],
    revision: num(r.revision, 0),
  }
}

function mergeById<T extends { id: string; updatedAt: number }>(a: T[], b: T[]): T[] {
  const byId = new Map(a.map((x) => [x.id, x]))
  for (const x of b) {
    const mine = byId.get(x.id)
    if (!mine || x.updatedAt > mine.updatedAt) byId.set(x.id, x)
  }
  return [...byId.values()]
}

/** Two copies deck by deck and card by card: the newer change wins, deletions and reviews included. */
export function mergeFlashcards(a: FlashcardsState, b: FlashcardsState): FlashcardsState {
  return { decks: mergeById(a.decks, b.decks), cards: mergeById(a.cards, b.cards), revision: Math.max(a.revision, b.revision) }
}

export const activeDecks = (s: FlashcardsState) => s.decks.filter((d) => d.deletedAt === null).sort((a, b) => a.name.localeCompare(b.name, 'nl'))

/** Cards of [deckId] (or of all live decks), deleted ones and those of deleted decks left out. */
export function cardsOf(s: FlashcardsState, deckId?: string): Flashcard[] {
  const live = new Set(activeDecks(s).map((d) => d.id))
  return s.cards.filter((c) => c.deletedAt === null && live.has(c.deckId) && (deckId === undefined || c.deckId === deckId))
}

/** Cards to ask now, the longest overdue first. */
export const dueCards = (s: FlashcardsState, now: number, deckId?: string) => cardsOf(s, deckId).filter((c) => c.due <= now).sort((a, b) => a.due - b.due)

export function deckStats(s: FlashcardsState, deckId: string, now: number): { total: number; due: number; fresh: number; learned: number } {
  const cards = cardsOf(s, deckId)
  return {
    total: cards.length,
    due: cards.filter((c) => c.due <= now).length,
    fresh: cards.filter((c) => c.reps === 0 && c.lapses === 0).length,
    // Known for three weeks or more.
    learned: cards.filter((c) => c.interval >= 21).length,
  }
}

export function newCard(id: string, deckId: string, front: string, back: string, now: number): Flashcard {
  return {
    id,
    deckId,
    front: front.trim().slice(0, MAX_CARD_TEXT),
    back: back.trim().slice(0, MAX_CARD_TEXT),
    due: now,
    interval: 0,
    ease: START_EASE,
    reps: 0,
    lapses: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

/** The days until the next time for [grade]; 0 means within the session. */
export function nextInterval(card: Flashcard, grade: CardGrade): number {
  if (grade === 'again') return 0
  const first = card.reps === 0
  if (grade === 'hard') return first ? 1 : Math.max(card.interval + 1, Math.round(card.interval * 1.2))
  if (grade === 'good') return first ? 1 : card.reps === 1 ? Math.max(3, card.interval + 1) : Math.max(card.interval + 1, Math.round(card.interval * card.ease))
  return first ? 4 : Math.max(card.interval + 2, Math.round(card.interval * card.ease * 1.3))
}

/** The card after an answer with [grade] at [now]. */
export function reviewCard(card: Flashcard, grade: CardGrade, now: number): Flashcard {
  const interval = nextInterval(card, grade)
  const easeChange = { again: -0.2, hard: -0.15, good: 0, easy: 0.15 }[grade]
  const ease = Math.min(MAX_EASE, Math.max(MIN_EASE, card.ease + easeChange))
  if (grade === 'again') return { ...card, interval: 0, ease, reps: 0, lapses: card.lapses + 1, due: now + AGAIN_MS, updatedAt: now }
  // From midnight on the day it comes due, so it is ready the whole day.
  return { ...card, interval, ease, reps: card.reps + 1, due: shiftDay(startOfDay(now), interval), updatedAt: now }
}

/** "10 min", "1 dag", "3 dagen", "2 mnd": shown on the answer buttons. */
export function intervalLabel(days: number): string {
  if (days === 0) return '10 min'
  if (days === 1) return '1 dag'
  if (days < 31) return `${days} dagen`
  if (days < 365) return `${Math.round(days / 30)} mnd`
  return `${(days / 365).toFixed(1).replace('.', ',').replace(',0', '')} jaar`
}

/**
 * Reads the cards NEXUS AI wrote, in blocks of "V: question" and "A: answer". Lines after A:
 * belong to the answer until the next V:. Blocks without both parts are skipped.
 */
export function parseAiCards(text: string): Array<{ front: string; back: string }> {
  const out: Array<{ front: string; back: string }> = []
  let front: string[] | null = null
  let back: string[] | null = null
  const flush = () => {
    const f = front?.join('\n').trim()
    const b = back?.join('\n').trim()
    if (f && b) out.push({ front: f.slice(0, MAX_CARD_TEXT), back: b.slice(0, MAX_CARD_TEXT) })
    front = null
    back = null
  }
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const q = line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?(?:V|Vraag)\s*(?:\*\*)?\s*[:.]\s*(?:\*\*)?\s*(.*)$/i)
    const a = line.match(/^\s*(?:[-*]\s*)?(?:\*\*)?(?:A|Antwoord)\s*(?:\*\*)?\s*[:.]\s*(?:\*\*)?\s*(.*)$/i)
    if (q) {
      flush()
      front = [q[1]]
    } else if (a && front) {
      back = [a[1]]
    } else if (back) {
      back.push(line)
    } else if (front) {
      front.push(line)
    }
  }
  flush()
  return out
}
