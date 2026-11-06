// Darts practice: Around the Clock, doubles, Bob's 27, scoring and checkout training, kept with your matches (key 'darts').
import { checkoutRoute } from './darts'

export type PracticeGame = 'clock' | 'doubles' | 'bobs27' | 'scoring' | 'checkout'
export const PRACTICE_GAMES: PracticeGame[] = ['clock', 'doubles', 'bobs27', 'scoring', 'checkout']
export const PRACTICE_LABELS: Record<PracticeGame, string> = { clock: 'Around the Clock', doubles: 'Doubles rond', bobs27: "Bob's 27", scoring: 'Scoring op T20', checkout: 'Checkout-training' }
export const PRACTICE_HELP: Record<PracticeGame, string> = {
  clock: 'Raak 1 tot 20 en dan de bull, in volgorde.',
  doubles: 'Raak D1 tot D20 en dan de bull, in volgorde; tik per pijl Raak of Mis.',
  bobs27: 'Je begint met 27. Per double (D1 tot D20, dan de bull) gooi je drie pijlen: elke treffer telt de double erbij, geen treffer haalt hem eraf. Onder nul is het gedaan.',
  scoring: 'Tien beurten op T20: vul per beurt het totaal in en zie je gemiddelde.',
  checkout: 'Gooi een willekeurige finish uit in hoogstens 9 pijlen.',
}
export const MAX_PRACTICE = 300
/** Around the Clock and Doubles rond: 1 to 20, then the bull. */
export const CLOCK_TARGETS = 21
/** Bob's 27: D1 to D20, then the bull. */
export const BOBS_TARGETS = 21
const BOBS_START = 27
/** Scoring: this many visits per round. */
export const SCORING_VISITS = 10
/** Totals three darts can never make. */
const IMPOSSIBLE = new Set([163, 166, 169, 172, 173, 175, 176, 178, 179])
const MAX_THROWS = 500
const MAX_ATTEMPTS = 50
/** Darts per checkout attempt: three visits. */
export const CHECKOUT_DARTS = 9

export interface CheckoutAttempt {
  target: number
  /** Darts it took, or null when it did not go out in nine. */
  darts: number | null
}

export interface DartsPractice {
  id: string
  game: PracticeGame
  /** Around the Clock: one entry per dart, hit or miss. */
  throws: boolean[]
  /** Checkout training: one entry per target. */
  attempts: CheckoutAttempt[]
  /** Bob's 27: darts that hit (0 to 3) per double, in order. */
  hits: number[]
  /** Scoring: the total of each visit. */
  visits: number[]
  /** Checkout training: the target being played now. */
  next: number
  startedAt: number
  finishedAt: number | null
  updatedAt: number
  deletedAt: number | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Whether [n] can be thrown out with a double in three darts. */
export const finishable = (n: number) => n >= 2 && n <= 170 && checkoutRoute(n, true, 3) !== null

export function parsePractice(raw: unknown): DartsPractice | null {
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as Record<string, unknown>
  if (typeof p.id !== 'string' || !PRACTICE_GAMES.includes(p.game as PracticeGame)) return null
  const attempts = (Array.isArray(p.attempts) ? p.attempts : []).flatMap((x): CheckoutAttempt[] => {
    const a = x as Record<string, unknown> | null
    const target = num(a?.target)
    if (!a || target === null || !finishable(target)) return []
    const darts = num(a.darts)
    return [{ target, darts: darts !== null && darts >= 1 && darts <= CHECKOUT_DARTS ? Math.round(darts) : null }]
  })
  const next = num(p.next)
  return {
    id: p.id,
    game: p.game as PracticeGame,
    throws: (Array.isArray(p.throws) ? p.throws : []).map((t) => t === true).slice(0, MAX_THROWS),
    attempts: attempts.slice(0, MAX_ATTEMPTS),
    hits: (Array.isArray(p.hits) ? p.hits : []).map((h) => Math.min(3, Math.max(0, Math.round(num(h) ?? 0)))).slice(0, BOBS_TARGETS),
    visits: (Array.isArray(p.visits) ? p.visits : []).map((v) => num(v)).filter((v): v is number => v !== null && Number.isInteger(v) && v >= 0 && v <= 180 && !IMPOSSIBLE.has(v)).slice(0, SCORING_VISITS),
    next: next !== null && finishable(next) ? next : 40,
    startedAt: num(p.startedAt) ?? 0,
    finishedAt: num(p.finishedAt),
    updatedAt: num(p.updatedAt) ?? 0,
    deletedAt: num(p.deletedAt),
  }
}

/** A random finish between [min] and [max] (default 41 to 170) that can be thrown out. */
export function pickCheckout(random: () => number = Math.random, min = 41, max = 170): number {
  for (let i = 0; i < 100; i++) {
    const n = min + Math.floor(random() * (max - min + 1))
    if (finishable(n)) return n
  }
  return 40
}

export function newPractice(id: string, game: PracticeGame, now: number, random: () => number = Math.random): DartsPractice {
  return { id, game, throws: [], attempts: [], hits: [], visits: [], next: game === 'checkout' ? pickCheckout(random) : 40, startedAt: now, finishedAt: null, updatedAt: now, deletedAt: null }
}

/** Around the Clock and Doubles rond: how many targets are done (0 to 21). */
export const clockHits = (p: DartsPractice) => Math.min(CLOCK_TARGETS, p.throws.filter(Boolean).length)

/** Around the Clock and Doubles rond: what to aim at now ('7', 'D7', 'Bull'), or null when it is done. */
export function clockTarget(p: DartsPractice): string | null {
  const hits = clockHits(p)
  if (hits >= CLOCK_TARGETS) return null
  if (hits === CLOCK_TARGETS - 1) return 'Bull'
  return p.game === 'doubles' ? `D${hits + 1}` : String(hits + 1)
}

/** One dart in Around the Clock or Doubles rond; hitting the bull ends the round. */
export function clockThrow(p: DartsPractice, hit: boolean, now: number): DartsPractice {
  if (p.finishedAt !== null || p.throws.length >= MAX_THROWS) return p
  const throws = [...p.throws, hit]
  const done = throws.filter(Boolean).length >= CLOCK_TARGETS
  return { ...p, throws, finishedAt: done ? now : null, updatedAt: now }
}

/** Checkout training: the result for the current target, then a new target. */
export function checkoutResult(p: DartsPractice, darts: number | null, now: number, random: () => number = Math.random): DartsPractice {
  if (p.finishedAt !== null) return p
  const attempts = [...p.attempts, { target: p.next, darts: darts !== null && darts >= 1 && darts <= CHECKOUT_DARTS ? Math.round(darts) : null }]
  const full = attempts.length >= MAX_ATTEMPTS
  return { ...p, attempts, next: pickCheckout(random), finishedAt: full ? now : null, updatedAt: now }
}

// Bob's 27 ------------------------------------------------------------------------------------------

/** What a hit on Bob's 27 target [i] (0-based) is worth: D1 = 2 … D20 = 40, bull = 50. */
const bobsValue = (i: number) => (i >= BOBS_TARGETS - 1 ? 50 : (i + 1) * 2)

/** Bob's 27: the score after the doubles thrown so far. */
export function bobsScore(p: DartsPractice): number {
  return p.hits.reduce<number>((s, h, i) => s + (h > 0 ? h * bobsValue(i) : -bobsValue(i)), BOBS_START)
}

/** Bob's 27: the double to aim at now ('D7', 'Bull'), or null when the round is over. */
export function bobsTarget(p: DartsPractice): string | null {
  if (p.finishedAt !== null || p.hits.length >= BOBS_TARGETS) return null
  return p.hits.length === BOBS_TARGETS - 1 ? 'Bull' : `D${p.hits.length + 1}`
}

/** Bob's 27: three darts at the current double, [hits] of them in. Below zero or after the bull it ends. */
export function bobsRound(p: DartsPractice, hits: number, now: number): DartsPractice {
  if (bobsTarget(p) === null) return p
  const next = { ...p, hits: [...p.hits, Math.min(3, Math.max(0, Math.round(hits)))], updatedAt: now }
  return { ...next, finishedAt: bobsScore(next) <= 0 || next.hits.length >= BOBS_TARGETS ? now : null }
}

// Scoring --------------------------------------------------------------------------------------------

/** Scoring: one visit at T20, as its total. */
export function scoringVisit(p: DartsPractice, score: number, now: number): DartsPractice | { error: string } {
  if (p.finishedAt !== null || p.visits.length >= SCORING_VISITS) return { error: 'Deze ronde is al gedaan.' }
  if (!Number.isInteger(score) || score < 0 || score > 180) return { error: 'Een beurt is 0 tot 180.' }
  if (IMPOSSIBLE.has(score)) return { error: `${score} kan niet met drie pijlen.` }
  const visits = [...p.visits, score]
  return { ...p, visits, finishedAt: visits.length >= SCORING_VISITS ? now : null, updatedAt: now }
}

/** Scoring: points per visit so far, or null before the first. */
export const scoringAverage = (p: DartsPractice): number | null => (p.visits.length > 0 ? Math.round((p.visits.reduce<number>((s, v) => s + v, 0) / p.visits.length) * 10) / 10 : null)

/** A one-line result of a round, for the list of earlier rounds. */
export function practiceSummary(p: DartsPractice): string {
  switch (p.game) {
    case 'clock':
    case 'doubles':
      return clockHits(p) >= CLOCK_TARGETS ? `${p.throws.length} pijlen` : `tot ${clockHits(p)} van ${CLOCK_TARGETS}`
    case 'bobs27':
      return `${bobsScore(p)} punten${p.hits.length < BOBS_TARGETS ? ` (${p.hits.length} van ${BOBS_TARGETS} doubles)` : ''}`
    case 'scoring':
      return `gem. ${scoringAverage(p) ?? 0} over ${p.visits.length} beurten`
    case 'checkout':
      return `${p.attempts.filter((a) => a.darts !== null).length} van ${p.attempts.length} uit`
  }
}

/** Takes back the last dart, double, visit or checkout result. */
export function undoPractice(p: DartsPractice, now: number): DartsPractice {
  if (p.game === 'bobs27') return p.hits.length === 0 ? p : { ...p, hits: p.hits.slice(0, -1), finishedAt: null, updatedAt: now }
  if (p.game === 'scoring') return p.visits.length === 0 ? p : { ...p, visits: p.visits.slice(0, -1), finishedAt: null, updatedAt: now }
  if (p.game === 'clock' || p.game === 'doubles') return p.throws.length === 0 ? p : { ...p, throws: p.throws.slice(0, -1), finishedAt: null, updatedAt: now }
  const last = p.attempts[p.attempts.length - 1]
  return last ? { ...p, attempts: p.attempts.slice(0, -1), next: last.target, finishedAt: null, updatedAt: now } : p
}

export const stopPractice = (p: DartsPractice, now: number): DartsPractice => (p.finishedAt !== null ? p : { ...p, finishedAt: now, updatedAt: now })

export function mergePractice(a: DartsPractice[], b: DartsPractice[]): DartsPractice[] {
  const byId = new Map(a.map((p) => [p.id, p]))
  for (const p of b) {
    const mine = byId.get(p.id)
    if (!mine || p.updatedAt > mine.updatedAt) byId.set(p.id, p)
  }
  return [...byId.values()].sort((x, y) => y.startedAt - x.startedAt).slice(0, MAX_PRACTICE)
}

export interface PracticeStats {
  clockRounds: number
  /** Fewest darts for a full round, or null. */
  clockBest: number | null
  /** Average darts over the last five full rounds, or null. */
  clockRecent: number | null
  /** Share of darts that hit, 0 to 100. */
  clockHitRate: number
  checkoutTries: number
  checkoutDone: number
  /** Share of targets thrown out, 0 to 100. */
  checkoutRate: number
  /** Highest target thrown out, 0 when none. */
  checkoutHighest: number
  /** Average darts for a target thrown out, or null. */
  checkoutDarts: number | null
  doublesRounds: number
  /** Fewest darts for a full Doubles rond, or null. */
  doublesBest: number | null
  /** Share of darts at a double that hit, 0 to 100. */
  doublesHitRate: number
  bobsRounds: number
  /** Highest Bob's 27 score of a finished round, or null. */
  bobsBest: number | null
  /** Average Bob's 27 score over the last five finished rounds, or null. */
  bobsRecent: number | null
  scoringRounds: number
  /** Best points per visit over a full scoring round, or null. */
  scoringBest: number | null
  /** Points per visit over every scoring visit, or null. */
  scoringAverage: number | null
}

export function practiceStats(sessions: DartsPractice[]): PracticeStats {
  const live = sessions.filter((p) => p.deletedAt === null).sort((a, b) => b.startedAt - a.startedAt)
  const rounds = live.filter((p) => p.game === 'clock' && clockHits(p) >= CLOCK_TARGETS).map((p) => p.throws.length)
  const doubles = live.filter((p) => p.game === 'doubles')
  const doublesRounds = doubles.filter((p) => clockHits(p) >= CLOCK_TARGETS).map((p) => p.throws.length)
  const doubleThrows = doubles.flatMap((p) => p.throws)
  const bobs = live.filter((p) => p.game === 'bobs27' && p.finishedAt !== null && p.hits.length > 0).map(bobsScore)
  const scoring = live.filter((p) => p.game === 'scoring')
  const fullScoring = scoring.filter((p) => p.visits.length >= SCORING_VISITS).map((p) => scoringAverage(p) ?? 0)
  const scoringVisits = scoring.flatMap((p) => p.visits)
  const allThrows = live.filter((p) => p.game === 'clock').flatMap((p) => p.throws)
  const attempts = live.filter((p) => p.game === 'checkout').flatMap((p) => p.attempts)
  const done = attempts.filter((a) => a.darts !== null)
  const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)
  const recent = rounds.slice(0, 5)
  const round1 = (x: number) => Math.round(x * 10) / 10
  return {
    clockRounds: rounds.length,
    clockBest: rounds.length > 0 ? Math.min(...rounds) : null,
    clockRecent: recent.length > 0 ? round1(recent.reduce<number>((s, n) => s + n, 0) / recent.length) : null,
    clockHitRate: pct(allThrows.filter(Boolean).length, allThrows.length),
    checkoutTries: attempts.length,
    checkoutDone: done.length,
    checkoutRate: pct(done.length, attempts.length),
    checkoutHighest: done.reduce<number>((m, a) => Math.max(m, a.target), 0),
    checkoutDarts: done.length > 0 ? round1(done.reduce<number>((s, a) => s + (a.darts ?? 0), 0) / done.length) : null,
    doublesRounds: doublesRounds.length,
    doublesBest: doublesRounds.length > 0 ? Math.min(...doublesRounds) : null,
    doublesHitRate: pct(doubleThrows.filter(Boolean).length, doubleThrows.length),
    bobsRounds: bobs.length,
    bobsBest: bobs.length > 0 ? Math.max(...bobs) : null,
    bobsRecent: bobs.length > 0 ? round1(bobs.slice(0, 5).reduce<number>((s, n) => s + n, 0) / Math.min(5, bobs.length)) : null,
    scoringRounds: fullScoring.length,
    scoringBest: fullScoring.length > 0 ? Math.max(...fullScoring) : null,
    scoringAverage: scoringVisits.length > 0 ? round1(scoringVisits.reduce<number>((s, n) => s + n, 0) / scoringVisits.length) : null,
  }
}
