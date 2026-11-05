/**
 * Darts: a scorer for 301/501/701 with legs, double-out, a checkout tip for what is left, and stats
 * from your own matches (3-dart average, first 9, 180s, highest checkout). You type the total of
 * each visit, as on a scoreboard. One document per account (user_settings key 'darts'). Pure logic.
 */
import { MAX_PRACTICE, mergePractice, parsePractice, type DartsPractice } from './dartsPractice'

export type DartsMode = 301 | 501 | 701
export const DARTS_MODES: DartsMode[] = [301, 501, 701]
export const MAX_PLAYERS = 4
export const MAX_MATCHES = 500
const MAX_NAME = 30

/** One visit: up to three darts, entered as their total. */
export interface DartsVisit {
  player: number
  score: number
  /** Darts thrown; fewer than 3 only on the finishing visit. */
  darts: number
  bust: boolean
}

export interface DartsLeg {
  starter: number
  visits: DartsVisit[]
  winner: number | null
}

export interface DartsMatch {
  id: string
  mode: DartsMode
  legsToWin: number
  doubleOut: boolean
  players: string[]
  legs: DartsLeg[]
  winner: number | null
  startedAt: number
  finishedAt: number | null
  updatedAt: number
  deletedAt: number | null
}

export interface DartsSettings {
  /** Your own name in matches, so the stats know which player is you. */
  me: string
  mode: DartsMode
  legsToWin: number
  doubleOut: boolean
  updatedAt: number
}

export interface DartsState {
  matches: DartsMatch[]
  /** Practice rounds (Around the Clock, checkout training). */
  practice: DartsPractice[]
  settings: DartsSettings
  revision: number
}

export const emptyDarts = (): DartsState => ({ matches: [], practice: [], settings: { me: 'Ik', mode: 501, legsToWin: 3, doubleOut: true, updatedAt: 0 }, revision: 0 })

// Parsing and merging -------------------------------------------------------------------------------

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const mode = (v: unknown): DartsMode => (DARTS_MODES.includes(v as DartsMode) ? (v as DartsMode) : 501)
const legs = (v: unknown) => Math.min(11, Math.max(1, Math.round(num(v) ?? 3)))

function parseMatch(raw: unknown): DartsMatch | null {
  if (typeof raw !== 'object' || raw === null) return null
  const m = raw as Record<string, unknown>
  if (typeof m.id !== 'string' || !Array.isArray(m.players)) return null
  const players = m.players.filter((p): p is string => typeof p === 'string').map((p) => p.slice(0, MAX_NAME)).slice(0, MAX_PLAYERS)
  if (players.length === 0) return null
  const who = (v: unknown) => {
    const n = num(v)
    return n !== null && n >= 0 && n < players.length ? Math.round(n) : null
  }
  const parsedLegs: DartsLeg[] = (Array.isArray(m.legs) ? m.legs : []).flatMap((l): DartsLeg[] => {
    if (typeof l !== 'object' || l === null) return []
    const leg = l as Record<string, unknown>
    const visits = (Array.isArray(leg.visits) ? leg.visits : []).flatMap((x): DartsVisit[] => {
      const v = x as Record<string, unknown> | null
      const player = who(v?.player)
      const score = num(v?.score)
      if (!v || player === null || score === null || score < 0 || score > 180) return []
      const darts = num(v.darts)
      return [{ player, score: Math.round(score), darts: darts !== null && darts >= 1 && darts <= 3 ? Math.round(darts) : 3, bust: v.bust === true }]
    })
    return [{ starter: who(leg.starter) ?? 0, visits, winner: who(leg.winner) }]
  })
  return {
    id: m.id,
    mode: mode(m.mode),
    legsToWin: legs(m.legsToWin),
    doubleOut: m.doubleOut !== false,
    players,
    legs: parsedLegs.length > 0 ? parsedLegs : [{ starter: 0, visits: [], winner: null }],
    winner: who(m.winner),
    startedAt: num(m.startedAt) ?? 0,
    finishedAt: num(m.finishedAt),
    updatedAt: num(m.updatedAt) ?? 0,
    deletedAt: num(m.deletedAt),
  }
}

export function parseDarts(raw: unknown): DartsState {
  if (typeof raw !== 'object' || raw === null) return emptyDarts()
  const v = raw as Record<string, unknown>
  const s = (typeof v.settings === 'object' && v.settings !== null ? v.settings : {}) as Record<string, unknown>
  const base = emptyDarts().settings
  return {
    matches: (Array.isArray(v.matches) ? v.matches : []).map(parseMatch).filter((m): m is DartsMatch => m !== null).slice(0, MAX_MATCHES),
    practice: (Array.isArray(v.practice) ? v.practice : []).map(parsePractice).filter((p): p is DartsPractice => p !== null).slice(0, MAX_PRACTICE),
    settings: { me: str(s.me, MAX_NAME).trim() || base.me, mode: mode(s.mode), legsToWin: legs(s.legsToWin), doubleOut: s.doubleOut !== false, updatedAt: num(s.updatedAt) ?? 0 },
    revision: num(v.revision) ?? 0,
  }
}

export function mergeDarts(a: DartsState, b: DartsState): DartsState {
  const byId = new Map(a.matches.map((m) => [m.id, m]))
  for (const m of b.matches) {
    const mine = byId.get(m.id)
    if (!mine || m.updatedAt > mine.updatedAt) byId.set(m.id, m)
  }
  return {
    matches: [...byId.values()].sort((x, y) => y.startedAt - x.startedAt).slice(0, MAX_MATCHES),
    practice: mergePractice(a.practice, b.practice),
    settings: b.settings.updatedAt > a.settings.updatedAt ? b.settings : a.settings,
    revision: Math.max(a.revision, b.revision),
  }
}

// Playing -------------------------------------------------------------------------------------------

/** Totals three darts can never make. */
const IMPOSSIBLE = new Set([163, 166, 169, 172, 173, 175, 176, 178, 179])
/** Left-overs of 170 or less that cannot be finished with a double in three darts. */
const BOGEY = new Set([159, 162, 163, 165, 166, 168, 169])

export const liveMatches = (s: DartsState) => s.matches.filter((m) => m.deletedAt === null).sort((a, b) => b.startedAt - a.startedAt)
export const currentLeg = (m: DartsMatch): DartsLeg => m.legs[m.legs.length - 1]

/** What [player] still has to throw in [leg]. */
export function remaining(m: DartsMatch, player: number, leg: DartsLeg = currentLeg(m)): number {
  return leg.visits.reduce<number>((left, v) => (v.player === player && !v.bust ? left - v.score : left), m.mode)
}

/** Whose turn it is in the leg that runs, or null when the match is over. */
export function toThrow(m: DartsMatch): number | null {
  if (m.winner !== null) return null
  const leg = currentLeg(m)
  return (leg.starter + leg.visits.length) % m.players.length
}

export function newMatch(id: string, players: string[], options: Pick<DartsMatch, 'mode' | 'legsToWin' | 'doubleOut'>, now: number): DartsMatch | { error: string } {
  const names = players.map((p) => p.trim().slice(0, MAX_NAME)).filter(Boolean)
  if (names.length === 0) return { error: 'Geef minstens één speler een naam.' }
  if (names.length > MAX_PLAYERS) return { error: `Hoogstens ${MAX_PLAYERS} spelers.` }
  return { id, ...options, legsToWin: legs(options.legsToWin), players: names, legs: [{ starter: 0, visits: [], winner: null }], winner: null, startedAt: now, finishedAt: null, updatedAt: now, deletedAt: null }
}

/**
 * Adds a visit for the player whose turn it is. A visit that goes below zero, leaves 1 with
 * double-out or finishes on a score no double can end is a bust: it counts as thrown but scores
 * nothing. Finishing wins the leg; enough legs win the match and the next leg starts with the next player.
 */
export function addVisit(m: DartsMatch, score: number, now: number, darts = 3): DartsMatch | { error: string } {
  const player = toThrow(m)
  if (player === null) return { error: 'Deze wedstrijd is al gedaan.' }
  if (!Number.isInteger(score) || score < 0 || score > 180) return { error: 'Een beurt is 0 tot 180.' }
  if (IMPOSSIBLE.has(score)) return { error: `${score} kan niet met drie pijlen.` }
  const left = remaining(m, player) - score
  const finishable = !m.doubleOut || (score <= 170 && !BOGEY.has(score))
  const bust = left < 0 || (m.doubleOut && left === 1) || (left === 0 && !finishable)
  const leg = currentLeg(m)
  const visit: DartsVisit = { player, score, darts: left === 0 && !bust ? Math.min(3, Math.max(1, Math.round(darts))) : 3, bust }
  const done: DartsLeg = { ...leg, visits: [...leg.visits, visit], winner: left === 0 && !bust ? player : null }
  let next: DartsMatch = { ...m, legs: [...m.legs.slice(0, -1), done], updatedAt: now }
  if (done.winner !== null) {
    const won = next.legs.filter((l) => l.winner === player).length
    if (won >= m.legsToWin) next = { ...next, winner: player, finishedAt: now }
    else next = { ...next, legs: [...next.legs, { starter: (leg.starter + 1) % m.players.length, visits: [], winner: null }] }
  }
  return next
}

/** Takes the last visit back, also when it won a leg or the match. */
export function undoVisit(m: DartsMatch, now: number): DartsMatch {
  let all = m.legs
  if (currentLeg(m).visits.length === 0 && all.length > 1) all = all.slice(0, -1)
  const leg = all[all.length - 1]
  if (leg.visits.length === 0) return m
  return { ...m, legs: [...all.slice(0, -1), { ...leg, visits: leg.visits.slice(0, -1), winner: null }], winner: null, finishedAt: null, updatedAt: now }
}

export const legsWon = (m: DartsMatch, player: number) => m.legs.filter((l) => l.winner === player).length

// Checkout tips -------------------------------------------------------------------------------------

interface Dart {
  label: string
  value: number
  double: boolean
}

const DOUBLE_ORDER = [20, 16, 18, 12, 10, 8, 19, 17, 14, 15, 13, 11, 9, 6, 7, 5, 4, 3, 2, 1]
const DOUBLES: Dart[] = [...DOUBLE_ORDER.map((n) => ({ label: `D${n}`, value: n * 2, double: true })), { label: 'Bull', value: 50, double: true }]
const SETUPS: Dart[] = [
  ...[20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map((n) => ({ label: `T${n}`, value: n * 3, double: false })),
  ...Array.from({ length: 20 }, (_, i) => 20 - i).map((n) => ({ label: `${n}`, value: n, double: false })),
  { label: '25', value: 25, double: false },
  { label: 'Bull', value: 50, double: true },
  ...[9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => ({ label: `T${n}`, value: n * 3, double: false })),
]
const ANY: Dart[] = [...SETUPS, ...DOUBLES.filter((d) => d.label !== 'Bull')]

function finishes(rest: number, doubleOut: boolean): Dart[] {
  return doubleOut ? DOUBLES.filter((d) => d.value === rest) : ANY.filter((d) => d.value === rest)
}

/**
 * A way to throw out [rest] in at most [darts] darts, like "T20 T20 Bull", or null when there is
 * none. Prefers fewer darts, then the usual doubles (D20, D16 …), then big setup darts.
 */
export function checkoutRoute(rest: number, doubleOut = true, darts = 3): string[] | null {
  if (rest <= 0 || darts < 1) return null
  const one = finishes(rest, doubleOut)[0]
  if (one) return [one.label]
  if (darts === 1) return null
  let best: { route: string[]; cost: number } | null = null
  SETUPS.forEach((s, i) => {
    const end = finishes(rest - s.value, doubleOut)[0]
    if (!end) return
    const cost = (doubleOut ? DOUBLES.indexOf(end) * 5 : 0) + i
    if (!best || cost < best.cost) best = { route: [s.label, end.label], cost }
  })
  if (best) return (best as { route: string[] }).route
  if (darts === 2) return null
  for (const s of SETUPS) {
    const tail = checkoutRoute(rest - s.value, doubleOut, 2)
    if (tail && tail.length === 2) return [s.label, ...tail]
  }
  return null
}

// Stats ---------------------------------------------------------------------------------------------

export interface DartsStats {
  matches: number
  matchesWon: number
  legs: number
  legsWon: number
  /** Points per three darts; a bust counts as three darts for nothing. */
  average: number
  /** The same over the first three visits of each leg. */
  first9: number
  oneEighties: number
  tonForty: number
  tons: number
  highestCheckout: number
  /** Fewest darts in a leg you won, or null. */
  bestLeg: number | null
}

/** Your stats over finished and running matches, for the player named [name]. */
export function dartsStats(matches: DartsMatch[], name: string): DartsStats {
  const stats: DartsStats = { matches: 0, matchesWon: 0, legs: 0, legsWon: 0, average: 0, first9: 0, oneEighties: 0, tonForty: 0, tons: 0, highestCheckout: 0, bestLeg: null }
  let points = 0
  let darts = 0
  let points9 = 0
  let darts9 = 0
  const key = name.trim().toLowerCase()
  for (const m of matches) {
    if (m.deletedAt !== null) continue
    const me = m.players.findIndex((p) => p.trim().toLowerCase() === key)
    if (me < 0) continue
    stats.matches++
    if (m.winner === me) stats.matchesWon++
    for (const leg of m.legs) {
      const mine = leg.visits.filter((v) => v.player === me)
      if (mine.length === 0) continue
      stats.legs++
      let legDarts = 0
      mine.forEach((v, i) => {
        const scored = v.bust ? 0 : v.score
        points += scored
        darts += v.darts
        legDarts += v.darts
        if (i < 3) {
          points9 += scored
          darts9 += v.darts
        }
        if (!v.bust && v.score === 180) stats.oneEighties++
        else if (!v.bust && v.score >= 140) stats.tonForty++
        else if (!v.bust && v.score >= 100) stats.tons++
      })
      if (leg.winner === me) {
        stats.legsWon++
        stats.highestCheckout = Math.max(stats.highestCheckout, mine[mine.length - 1].score)
        stats.bestLeg = stats.bestLeg === null ? legDarts : Math.min(stats.bestLeg, legDarts)
      }
    }
  }
  const round = (x: number) => Math.round(x * 100) / 100
  stats.average = darts > 0 ? round((points / darts) * 3) : 0
  stats.first9 = darts9 > 0 ? round((points9 / darts9) * 3) : 0
  return stats
}

/** Calendar events that look like darts (in the title or the calendar's name, not a "tandarts"), from [from] on. */
export function dartsEvents<T extends { start: number; subject: string; room?: string }>(events: T[], from: number, max = 5): T[] {
  return events.filter((e) => e.start >= from && /(^|[^a-z])darts?/i.test(`${e.subject} ${e.room ?? ''}`)).sort((a, b) => a.start - b.start).slice(0, max)
}
