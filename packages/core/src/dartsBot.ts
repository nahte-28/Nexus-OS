/**
 * Darts tegen een bot: a computer player that throws its visits on a real board. Every dart is aimed
 * (T20 to score, the checkout route to finish) and lands with a spread that belongs to the level, so
 * a beginner sprays the board and a pro hits trebles and doubles. Pure logic; [rand] is injectable.
 */
import { checkoutRoute, isDouble } from './darts'

import type { BotLevel } from './darts'

export type { BotLevel }

export interface BotLevelInfo {
  id: BotLevel
  label: string
  /** Roughly the 3-dart average this level throws, to show when you pick it. */
  average: number
  /** Spread of a dart around the aim, in mm (standard deviation per axis). */
  spread: number
}

/** The levels, easiest first. Spreads are tuned so the averages hold over many legs (see the tests). */
export const BOT_LEVELS: BotLevelInfo[] = [
  { id: 'beginner', label: 'Beginner', average: 30, spread: 25.7 },
  { id: 'gevorderd', label: 'Gevorderd', average: 45, spread: 17.7 },
  { id: 'club', label: 'Clubspeler', average: 60, spread: 13 },
  { id: 'sterk', label: 'Sterk', average: 75, spread: 10 },
  { id: 'pro', label: 'Pro', average: 90, spread: 7.7 },
]

export const botLevel = (id: unknown): BotLevelInfo | null => BOT_LEVELS.find((l) => l.id === id) ?? null

/** The name the bot plays under, e.g. "Bot (Clubspeler)". */
export const botName = (level: BotLevel) => `Bot (${botLevel(level)?.label ?? level})`

/** One dart where it landed: its label like "T20", "5", "25", "Bull" or "Mis", and what it scores. */
export interface BotDart {
  label: string
  value: number
  double: boolean
}

export interface BotVisit {
  /** Total of the darts, as you would type it on the scoreboard. */
  score: number
  darts: number
  /** Darts aimed at a finishing double. */
  doubles: number
  bust: boolean
  thrown: BotDart[]
}

// The board, in mm from the centre (regulation sizes).
const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
const BULL = 6.35
const OUTER_BULL = 15.9
const TREBLE = [99, 107]
const DOUBLE = [162, 170]

/** Gaussian noise with spread 1 (Box–Muller). */
function gauss(rand: () => number): number {
  const u = Math.max(rand(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

/** Where to aim for [label]: the middle of that bed. */
function aim(label: string): { x: number; y: number } {
  if (label === 'Bull') return { x: 0, y: 0 }
  if (label === '25') return { x: 0, y: (BULL + OUTER_BULL) / 2 }
  const ring = label[0] === 'T' ? 'T' : label[0] === 'D' ? 'D' : 'S'
  const n = Number(ring === 'S' ? label : label.slice(1))
  const r = ring === 'T' ? (TREBLE[0] + TREBLE[1]) / 2 : ring === 'D' ? (DOUBLE[0] + DOUBLE[1]) / 2 : (TREBLE[1] + DOUBLE[0]) / 2
  const angle = ((90 - ORDER.indexOf(n) * 18) * Math.PI) / 180
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) }
}

/** What a dart scores where it lands. */
export function scoreAt(x: number, y: number): BotDart {
  const r = Math.hypot(x, y)
  if (r <= BULL) return { label: 'Bull', value: 50, double: true }
  if (r <= OUTER_BULL) return { label: '25', value: 25, double: false }
  if (r > DOUBLE[1]) return { label: 'Mis', value: 0, double: false }
  const deg = (Math.atan2(y, x) * 180) / Math.PI
  const n = ORDER[(((Math.round((90 - deg) / 18) % 20) + 20) % 20)]
  if (r >= DOUBLE[0]) return { label: `D${n}`, value: n * 2, double: true }
  if (r >= TREBLE[0] && r <= TREBLE[1]) return { label: `T${n}`, value: n * 3, double: false }
  return { label: `${n}`, value: n, double: false }
}

/** One dart aimed at [label] with [spread]. */
export function throwAt(label: string, spread: number, rand: () => number): BotDart {
  const a = aim(label)
  return scoreAt(a.x + gauss(rand) * spread, a.y + gauss(rand) * spread)
}

const LEAVES = [40, 32, 16, 36, 24, 20, 8, 12, 28, 38, 34, 30, 26, 22, 18, 14, 10, 6, 4, 2]

/** What the bot aims at with [rest] left and [darts] darts in hand. */
export function botTarget(rest: number, doubleOut: boolean, darts: number): string {
  const route = checkoutRoute(rest, doubleOut, darts)
  if (route) return route[0]
  // No finish this visit: score, but keep a double for the next one.
  if (rest > 61) return rest - 60 > 1 ? 'T20' : 'T19'
  const leave = LEAVES.find((d) => rest - d >= 1 && rest - d <= 20)
  return leave !== undefined ? `${rest - leave}` : rest > 20 ? '20' : `${Math.max(1, rest - 2)}`
}

/** The visit the bot throws with [rest] left. */
export function botVisit(rest: number, doubleOut: boolean, level: BotLevel, rand: () => number = Math.random): BotVisit {
  const spread = botLevel(level)?.spread ?? BOT_LEVELS[2].spread
  const thrown: BotDart[] = []
  let left = rest
  let doubles = 0
  for (let k = 0; k < 3; k++) {
    const target = botTarget(left, doubleOut, 3 - k)
    if (doubleOut && (target[0] === 'D' || target === 'Bull') && isDouble(left) && (target === 'Bull' ? 50 : Number(target.slice(1)) * 2) === left) doubles++
    const dart = throwAt(target, spread, rand)
    thrown.push(dart)
    left -= dart.value
    const bust = left < 0 || (doubleOut && left === 1) || (left === 0 && doubleOut && !dart.double)
    if (bust) return { score: rest - left, darts: 3, doubles, bust: true, thrown }
    if (left === 0) return { score: rest, darts: k + 1, doubles, bust: false, thrown }
  }
  return { score: rest - left, darts: 3, doubles, bust: false, thrown }
}

/** A small seeded random (mulberry32), for tests and replays. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
