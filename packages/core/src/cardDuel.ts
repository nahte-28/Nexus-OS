/**
 * Leerkaarten-duel: you challenge a friend with one of your decks. NEXUS turns up to 10 cards into
 * multiple choice (the right answer and three answers of other cards), you both answer the same
 * questions, and the database counts who got the most right (ties: the fastest wins).
 */
import type { Flashcard } from './flashcards'

export const DUEL_QUESTIONS = 10
export const DUEL_OPTIONS = 4
/** Text of a question or an option on the way to the database. */
export const DUEL_TEXT_MAX = 300

export interface DuelQuestion {
  front: string
  options: string[]
}

export type DuelStatus = 'open' | 'done' | 'declined'

export interface CardDuel {
  id: string
  /** Your side: 0 when you challenged, 1 when you were challenged. */
  side: 0 | 1
  otherName: string
  deckName: string
  questions: DuelQuestion[]
  status: DuelStatus
  /** Your picks (an option index per question) once you played, else null. */
  myPicks: number[] | null
  myScore: number | null
  myMs: number | null
  /** The right options and the other one's result, only once you played. */
  answers: number[] | null
  theirScore: number | null
  theirMs: number | null
  theirPlayed: boolean
  createdAt: number
  updatedAt: number
}

const clip = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, DUEL_TEXT_MAX)

/** Mixes [list] with [random] (Fisher–Yates), without changing it. */
function shuffled<T>(list: T[], random: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * The questions for a duel from the cards of one deck, or an error when the deck has fewer than
 * four cards with different answers. Each question has the right answer and three others.
 */
export function buildDuel(cards: Flashcard[], random: () => number = Math.random, count = DUEL_QUESTIONS): { questions: DuelQuestion[]; answers: number[] } | { error: string } {
  const seen = new Set<string>()
  const usable = cards.filter((c) => {
    const back = clip(c.back).toLowerCase()
    if (c.deletedAt !== null || !clip(c.front) || !back || seen.has(back)) return false
    seen.add(back)
    return true
  })
  if (usable.length < DUEL_OPTIONS) return { error: `Een duel vraagt minstens ${DUEL_OPTIONS} kaarten met een verschillend antwoord.` }
  const questions: DuelQuestion[] = []
  const answers: number[] = []
  for (const card of shuffled(usable, random).slice(0, count)) {
    const others = shuffled(usable.filter((c) => c.id !== card.id), random).slice(0, DUEL_OPTIONS - 1)
    const options = shuffled([card, ...others], random)
    questions.push({ front: clip(card.front), options: options.map((o) => clip(o.back)) })
    answers.push(options.findIndex((o) => o.id === card.id))
  }
  return { questions, answers }
}

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const time = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? v : NaN)
const ints = (v: unknown, n: number): number[] | null => (Array.isArray(v) && v.length === n && v.every((x) => isInt(x, -1, DUEL_OPTIONS - 1)) ? (v as number[]) : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function parseDuels(raw: unknown): CardDuel[] {
  return (Array.isArray(raw) ? raw : []).flatMap((x): CardDuel[] => {
    const r = x as Record<string, unknown> | null
    if (!r || typeof r.id !== 'string' || (r.side !== 0 && r.side !== 1) || typeof r.otherName !== 'string' || !r.otherName.trim()) return []
    if (r.status !== 'open' && r.status !== 'done' && r.status !== 'declined') return []
    const questions = (Array.isArray(r.questions) ? r.questions : []).flatMap((q): DuelQuestion[] => {
      const o = q as Record<string, unknown> | null
      if (!o || typeof o.front !== 'string' || !Array.isArray(o.options) || o.options.length !== DUEL_OPTIONS || !o.options.every((s) => typeof s === 'string')) return []
      return [{ front: o.front.slice(0, DUEL_TEXT_MAX), options: (o.options as string[]).map((s) => s.slice(0, DUEL_TEXT_MAX)) }]
    })
    if (questions.length === 0) return []
    const n = questions.length
    const createdAt = time(r.createdAt)
    const updatedAt = time(r.updatedAt)
    return [
      {
        id: r.id,
        side: r.side,
        otherName: r.otherName.trim().slice(0, 40),
        deckName: typeof r.deckName === 'string' ? r.deckName.slice(0, 80) : '',
        questions,
        status: r.status,
        myPicks: ints(r.myPicks, n),
        myScore: num(r.myScore),
        myMs: num(r.myMs),
        answers: ints(r.answers, n),
        theirScore: num(r.theirScore),
        theirMs: num(r.theirMs),
        theirPlayed: r.theirPlayed === true,
        createdAt: Number.isFinite(createdAt) ? createdAt : 0,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
      },
    ]
  })
}

/** Who won once both played: 'me', 'them' or 'tie' (same score and time); null before. */
export function duelWinner(d: CardDuel): 'me' | 'them' | 'tie' | null {
  if (d.myScore === null || d.theirScore === null) return null
  if (d.myScore !== d.theirScore) return d.myScore > d.theirScore ? 'me' : 'them'
  if (d.myMs === null || d.theirMs === null || d.myMs === d.theirMs) return 'tie'
  return d.myMs < d.theirMs ? 'me' : 'them'
}

const seconds = (ms: number | null) => (ms === null ? '' : ` in ${Math.round(ms / 1000)} s`)

/** One line for the list: what to do, or how it ended. */
export function duelLine(d: CardDuel): string {
  const total = d.questions.length
  if (d.status === 'declined') return d.side === 0 ? `${d.otherName} sloeg je duel af.` : 'Afgeslagen.'
  if (d.myPicks === null) return d.side === 1 ? `${d.otherName} daagt je uit: ${total} ${total === 1 ? 'vraag' : 'vragen'}.` : `Speel je eigen duel, dan krijgt ${d.otherName} het.`
  if (!d.theirPlayed) return `Jij: ${d.myScore} van ${total}${seconds(d.myMs)}. Wacht op ${d.otherName}.`
  const result = `${d.myScore}–${d.theirScore}`
  const winner = duelWinner(d)
  if (winner === 'me') return `Je won van ${d.otherName}, ${result}.`
  if (winner === 'them') return `${d.otherName} won, ${result}.`
  return `Gelijkspel, ${result}.`
}

/** Whether you still have to play it. */
export const duelToPlay = (d: CardDuel) => d.status === 'open' && d.myPicks === null
