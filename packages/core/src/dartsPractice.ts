// Darts practice: Around the Clock and checkout training, kept with your matches (key 'darts').
import { checkoutRoute } from './darts'

export type PracticeGame = 'clock' | 'checkout'
export const PRACTICE_LABELS: Record<PracticeGame, string> = { clock: 'Around the Clock', checkout: 'Checkout-training' }
export const MAX_PRACTICE = 300
/** Around the Clock: 1 to 20, then the bull. */
export const CLOCK_TARGETS = 21
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
  if (typeof p.id !== 'string' || (p.game !== 'clock' && p.game !== 'checkout')) return null
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
    game: p.game,
    throws: (Array.isArray(p.throws) ? p.throws : []).map((t) => t === true).slice(0, MAX_THROWS),
    attempts: attempts.slice(0, MAX_ATTEMPTS),
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
  return { id, game, throws: [], attempts: [], next: game === 'checkout' ? pickCheckout(random) : 40, startedAt: now, finishedAt: null, updatedAt: now, deletedAt: null }
}

/** Around the Clock: how many targets are done (0 to 21). */
export const clockHits = (p: DartsPractice) => Math.min(CLOCK_TARGETS, p.throws.filter(Boolean).length)

/** Around the Clock: the number to aim at now ('Bull' after 20), or null when it is done. */
export function clockTarget(p: DartsPractice): string | null {
  const hits = clockHits(p)
  return hits >= CLOCK_TARGETS ? null : hits === CLOCK_TARGETS - 1 ? 'Bull' : String(hits + 1)
}

/** One dart in Around the Clock; hitting the bull ends the round. */
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

/** Takes back the last dart or the last checkout result. */
export function undoPractice(p: DartsPractice, now: number): DartsPractice {
  if (p.game === 'clock') return p.throws.length === 0 ? p : { ...p, throws: p.throws.slice(0, -1), finishedAt: null, updatedAt: now }
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
}

export function practiceStats(sessions: DartsPractice[]): PracticeStats {
  const live = sessions.filter((p) => p.deletedAt === null).sort((a, b) => b.startedAt - a.startedAt)
  const rounds = live.filter((p) => p.game === 'clock' && clockHits(p) >= CLOCK_TARGETS).map((p) => p.throws.length)
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
  }
}
