/**
 * Darts: a scorer for 301/501/701 with legs, double-out, a checkout tip for what is left, and stats
 * from your own matches (3-dart average, first 9, 180s, highest checkout). You type the total of
 * each visit, as on a scoreboard. One document per account (user_settings key 'darts'). Pure logic.
 */
import { MAX_PRACTICE, mergePractice, parsePractice, type DartsPractice } from './dartsPractice'

/** The score each player starts a leg on: 501, 301, 701 or any own number from 2 to 1001 (e.g. 170). */
export type DartsMode = number
/** The usual starting scores; any other number from MIN_START to MAX_START is a custom game. */
export const DARTS_MODES: DartsMode[] = [170, 301, 501, 701, 1001]
export const MIN_START = 2
export const MAX_START = 1001
/** Sides in a match: players, or pairs (koppels). */
export const MAX_PLAYERS = 4
/** Players per side in a pairs match. */
export const MAX_MEMBERS = 2
export const MAX_LEGS_TO_WIN = 11
export const MAX_SETS_TO_WIN = 7
export const MAX_MATCHES = 500
const MAX_NAME = 30
const MAX_NICKNAME = 30
/** A pair's name, "Ethan & Remo". */
const MAX_TEAM = 2 * MAX_NAME + 3
/** Players you often play with, each with an optional nickname. */
export const MAX_ROSTER = 20

/** A player you play with often; the nickname is shown on the scoreboard and in the history. */
export interface DartsPlayer {
  name: string
  nickname: string
}

/** One visit: up to three darts, entered as their total. */
export interface DartsVisit {
  player: number
  score: number
  /** Darts thrown; fewer than 3 only on the finishing visit. */
  darts: number
  bust: boolean
  /** In a pairs match: which member of the side threw (0 or 1). */
  by?: number
}

export interface DartsLeg {
  /** The set this leg belongs to, from 0; always 0 without sets. */
  set: number
  starter: number
  visits: DartsVisit[]
  winner: number | null
}

export interface DartsMatch {
  id: string
  mode: DartsMode
  /** Legs to win a set (or the match without sets): best of 5 legs is 3. */
  legsToWin: number
  /** Sets to win the match; 1 means a match without sets. */
  setsToWin: number
  doubleOut: boolean
  /** One name per side; a pair is shown as "Ethan & Remo". */
  players: string[]
  /** Who is in each side, in throwing order; one name for a single player. */
  members: string[][]
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
  /** Your own nickname, e.g. "The Power"; empty for none. */
  nickname: string
  /** Players you often play with, to pick when you start a match. */
  roster: DartsPlayer[]
  mode: DartsMode
  legsToWin: number
  setsToWin: number
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

export const emptyDarts = (): DartsState => ({ matches: [], practice: [], settings: { me: 'Ik', nickname: '', roster: [], mode: 501, legsToWin: 3, setsToWin: 1, doubleOut: true, updatedAt: 0 }, revision: 0 })

// Parsing and merging -------------------------------------------------------------------------------

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
/** Whether [v] is a starting score a leg can be played from. */
export const validStart = (v: unknown): v is DartsMode => typeof v === 'number' && Number.isInteger(v) && v >= MIN_START && v <= MAX_START
const mode = (v: unknown): DartsMode => (validStart(v) ? v : 501)
const legs = (v: unknown) => Math.min(MAX_LEGS_TO_WIN, Math.max(1, Math.round(num(v) ?? 3)))
const sets = (v: unknown) => Math.min(MAX_SETS_TO_WIN, Math.max(1, Math.round(num(v) ?? 1)))

/** "best of 5" for 3 legs to win. */
export const bestOf = (toWin: number) => 2 * toWin - 1
/** The legs (or sets) to win for "best of [n]"; an even n rounds up, so best of 4 is first to 3. */
export const toWinFromBestOf = (n: number) => Math.max(1, Math.floor(Math.round(n) / 2) + 1)

/** "best of 5 legs" or "best of 3 sets, best of 5 legs per set". */
export function formatLabel(m: Pick<DartsMatch, 'legsToWin' | 'setsToWin'>): string {
  const legPart = m.legsToWin === 1 ? '1 leg' : `best of ${bestOf(m.legsToWin)} legs`
  return m.setsToWin > 1 ? `best of ${bestOf(m.setsToWin)} sets, ${legPart} per set` : legPart
}

function parseMatch(raw: unknown): DartsMatch | null {
  if (typeof raw !== 'object' || raw === null) return null
  const m = raw as Record<string, unknown>
  if (typeof m.id !== 'string' || !Array.isArray(m.players)) return null
  const players = m.players.filter((p): p is string => typeof p === 'string').map((p) => p.slice(0, MAX_TEAM)).slice(0, MAX_PLAYERS)
  if (players.length === 0) return null
  const rawMembers = Array.isArray(m.members) ? m.members : []
  const members = players.map((p, i) => {
    const list = Array.isArray(rawMembers[i]) ? (rawMembers[i] as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.slice(0, MAX_NAME)).slice(0, MAX_MEMBERS) : []
    return list.length > 0 ? list : [p]
  })
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
      const by = num(v.by)
      const member = by !== null && by >= 0 && by < members[player].length ? Math.round(by) : 0
      return [{ player, score: Math.round(score), darts: darts !== null && darts >= 1 && darts <= 3 ? Math.round(darts) : 3, bust: v.bust === true, ...(members[player].length > 1 ? { by: member } : {}) }]
    })
    const set = num(leg.set)
    return [{ set: set !== null && set >= 0 ? Math.round(set) : 0, starter: who(leg.starter) ?? 0, visits, winner: who(leg.winner) }]
  })
  return {
    id: m.id,
    mode: mode(m.mode),
    legsToWin: legs(m.legsToWin),
    setsToWin: sets(m.setsToWin),
    doubleOut: m.doubleOut !== false,
    players,
    members,
    legs: parsedLegs.length > 0 ? parsedLegs : [{ set: 0, starter: 0, visits: [], winner: null }],
    winner: who(m.winner),
    startedAt: num(m.startedAt) ?? 0,
    finishedAt: num(m.finishedAt),
    updatedAt: num(m.updatedAt) ?? 0,
    deletedAt: num(m.deletedAt),
  }
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

function parseRoster(raw: unknown): DartsPlayer[] {
  const out: DartsPlayer[] = []
  for (const x of Array.isArray(raw) ? raw : []) {
    const p = x as Record<string, unknown> | null
    const name = str(p?.name, MAX_NAME).trim()
    if (!name || out.some((o) => sameName(o.name, name))) continue
    out.push({ name, nickname: str(p?.nickname, MAX_NICKNAME).trim() })
    if (out.length >= MAX_ROSTER) break
  }
  return out
}

export function parseDarts(raw: unknown): DartsState {
  if (typeof raw !== 'object' || raw === null) return emptyDarts()
  const v = raw as Record<string, unknown>
  const s = (typeof v.settings === 'object' && v.settings !== null ? v.settings : {}) as Record<string, unknown>
  const base = emptyDarts().settings
  return {
    matches: (Array.isArray(v.matches) ? v.matches : []).map(parseMatch).filter((m): m is DartsMatch => m !== null).slice(0, MAX_MATCHES),
    practice: (Array.isArray(v.practice) ? v.practice : []).map(parsePractice).filter((p): p is DartsPractice => p !== null).slice(0, MAX_PRACTICE),
    settings: { me: str(s.me, MAX_NAME).trim() || base.me, nickname: str(s.nickname, MAX_NICKNAME).trim(), roster: parseRoster(s.roster), mode: mode(s.mode), legsToWin: legs(s.legsToWin), setsToWin: sets(s.setsToWin), doubleOut: s.doubleOut !== false, updatedAt: num(s.updatedAt) ?? 0 },
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

// Players and nicknames ----------------------------------------------------------------------------

/** The nickname of [name]: yours for your own name, else from your players; empty when there is none. */
export function nicknameOf(settings: DartsSettings, name: string): string {
  if (sameName(name, settings.me)) return settings.nickname.trim()
  return settings.roster.find((p) => sameName(p.name, name))?.nickname.trim() ?? ''
}

/** "Ethan 'The Power'" when there is a nickname, else just the name. */
export function playerLabel(settings: DartsSettings, name: string): string {
  const nick = nicknameOf(settings, name)
  return nick ? `${name} '${nick}'` : name
}

/** Adds a player to your list, or changes the nickname of one already there. */
export function savePlayer(settings: DartsSettings, name: string, nickname: string, now: number): DartsSettings | { error: string } {
  const clean = name.trim().slice(0, MAX_NAME)
  // Not trimmed while typing, so "The Power" keeps its space; parse and nicknameOf trim it.
  const nick = nickname.slice(0, MAX_NICKNAME)
  if (!clean) return { error: 'Geef de speler een naam.' }
  if (sameName(clean, settings.me)) return { ...settings, nickname: nick, updatedAt: now }
  const known = settings.roster.some((p) => sameName(p.name, clean))
  if (!known && settings.roster.length >= MAX_ROSTER) return { error: `Hoogstens ${MAX_ROSTER} spelers.` }
  const roster = known ? settings.roster.map((p) => (sameName(p.name, clean) ? { name: p.name, nickname: nick } : p)) : [...settings.roster, { name: clean, nickname: nick }]
  return { ...settings, roster, updatedAt: now }
}

export const removePlayer = (settings: DartsSettings, name: string, now: number): DartsSettings => ({ ...settings, roster: settings.roster.filter((p) => !sameName(p.name, name)), updatedAt: now })

/** Everyone with stats: you first, then your players, then other names from matches. */
export function knownPlayers(state: DartsState): string[] {
  const out: string[] = []
  const add = (n: string) => {
    if (n.trim() && !out.some((o) => sameName(o, n))) out.push(n.trim())
  }
  add(state.settings.me)
  state.settings.roster.forEach((p) => add(p.name))
  liveMatches(state).forEach((m) => m.members.flat().forEach(add))
  return out
}

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

export type MatchOptions = Pick<DartsMatch, 'mode' | 'legsToWin' | 'doubleOut'> & { setsToWin?: number }

/**
 * A new match. [players] holds one name per side, or for pairs (koppels) the members of each side;
 * a side with an empty name is left out.
 */
export function newMatch(id: string, players: Array<string | string[]>, options: MatchOptions, now: number): DartsMatch | { error: string } {
  const members = players.map((p) => (Array.isArray(p) ? p : [p]).map((x) => x.trim().slice(0, MAX_NAME)).filter(Boolean).slice(0, MAX_MEMBERS)).filter((m) => m.length > 0)
  if (members.length === 0) return { error: 'Geef minstens één speler een naam.' }
  if (members.length > MAX_PLAYERS) return { error: `Hoogstens ${MAX_PLAYERS} ${players.some(Array.isArray) ? 'koppels' : 'spelers'}.` }
  if (!validStart(options.mode)) return { error: `Een spel start op ${MIN_START} tot ${MAX_START}.` }
  const all = members.flat().map((n) => n.toLowerCase())
  if (new Set(all).size !== all.length) return { error: 'Elke speler mag maar één keer meedoen.' }
  return {
    id,
    mode: options.mode,
    doubleOut: options.doubleOut,
    legsToWin: legs(options.legsToWin),
    setsToWin: sets(options.setsToWin ?? 1),
    players: members.map((m) => m.join(' & ')),
    members,
    legs: [{ set: 0, starter: 0, visits: [], winner: null }],
    winner: null,
    startedAt: now,
    finishedAt: null,
    updatedAt: now,
    deletedAt: null,
  }
}

/** Whether this is a pairs match (a side with two players). */
export const isPairs = (m: DartsMatch) => m.members.some((x) => x.length > 1)

/** Who of [side] throws the next visit of [leg]: members take turns, and who starts moves on every leg. */
function memberToThrow(m: DartsMatch, side: number, leg: DartsLeg): number {
  const count = m.members[side]?.length ?? 1
  if (count <= 1) return 0
  const done = leg.visits.filter((v) => v.player === side).length
  return (done + m.legs.indexOf(leg)) % count
}

/** The name of whoever throws now, or null when the match is over. */
export function throwerName(m: DartsMatch): string | null {
  const side = toThrow(m)
  if (side === null) return null
  return m.members[side][memberToThrow(m, side, currentLeg(m))] ?? m.players[side]
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
  const pairs = (m.members[player]?.length ?? 1) > 1
  const visit: DartsVisit = { player, score, darts: left === 0 && !bust ? Math.min(3, Math.max(1, Math.round(darts))) : 3, bust, ...(pairs ? { by: memberToThrow(m, player, leg) } : {}) }
  const done: DartsLeg = { ...leg, visits: [...leg.visits, visit], winner: left === 0 && !bust ? player : null }
  let next: DartsMatch = { ...m, legs: [...m.legs.slice(0, -1), done], updatedAt: now }
  if (done.winner !== null) {
    const starter = (leg.starter + 1) % m.players.length
    if (legsInSet(next, player, leg.set) < m.legsToWin) next = { ...next, legs: [...next.legs, { set: leg.set, starter, visits: [], winner: null }] }
    else if (setsWon(next, player) >= m.setsToWin) next = { ...next, winner: player, finishedAt: now }
    else next = { ...next, legs: [...next.legs, { set: leg.set + 1, starter, visits: [], winner: null }] }
  }
  return next
}

/** The id a leg from the watch gets in NEXUS, so a second delivery changes nothing. */
export const watchMatchId = (id: string) => `watch-${id}`

/**
 * A solo leg scored on the watch, as a one-leg match for [me]: the visits are replayed with these
 * rules, so the watch cannot add what the scorer would refuse. A leg that was not out counts as stopped.
 */
export function watchMatch(leg: { id: string; mode: 301 | 501; startedAt: number; visits: Array<{ score: number; darts: number }> }, me: string, at: number): DartsMatch | null {
  const start = newMatch(watchMatchId(leg.id), [me], { mode: leg.mode, legsToWin: 1, doubleOut: true }, leg.startedAt)
  if ('error' in start) return null
  let m: DartsMatch = start
  for (const v of leg.visits) {
    const next = addVisit(m, v.score, at, v.darts)
    if ('error' in next) continue
    m = next
    if (m.winner !== null) break
  }
  if (currentLeg(m).visits.length === 0 && m.winner === null) return null
  return { ...m, finishedAt: m.finishedAt ?? at, updatedAt: at }
}

/** Takes the last visit back, also when it won a leg or the match. */
export function undoVisit(m: DartsMatch, now: number): DartsMatch {
  let all = m.legs
  if (currentLeg(m).visits.length === 0 && all.length > 1) all = all.slice(0, -1)
  const leg = all[all.length - 1]
  if (leg.visits.length === 0) return m
  return { ...m, legs: [...all.slice(0, -1), { ...leg, visits: leg.visits.slice(0, -1), winner: null }], winner: null, finishedAt: null, updatedAt: now }
}

/** Legs [player] won over the whole match. */
export const legsWon = (m: DartsMatch, player: number) => m.legs.filter((l) => l.winner === player).length
/** Legs [player] won in [set] (default: the set being played). */
export const legsInSet = (m: DartsMatch, player: number, set = currentLeg(m).set) => m.legs.filter((l) => l.set === set && l.winner === player).length
/** Sets [player] won; without sets this is 1 for the winner of the match. */
export function setsWon(m: DartsMatch, player: number): number {
  const last = m.legs.reduce<number>((n, l) => Math.max(n, l.set), 0)
  let won = 0
  for (let set = 0; set <= last; set++) if (legsInSet(m, player, set) >= m.legsToWin) won++
  return won
}

/** The score of a match: "3–1" in legs, or "2–1 sets" with sets. */
export function matchScore(m: DartsMatch): string {
  const count = m.setsToWin > 1 ? (i: number) => setsWon(m, i) : (i: number) => legsWon(m, i)
  return `${m.players.map((_, i) => count(i)).join('–')}${m.setsToWin > 1 ? ' sets' : ''}`
}

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

/** Points per three darts for [player], over the whole match or one leg; null before the first visit. A bust counts as three darts for nothing. */
export function playerAverage(m: DartsMatch, player: number, leg?: DartsLeg, member?: number): number | null {
  let points = 0
  let darts = 0
  for (const l of leg ? [leg] : m.legs) {
    for (const v of l.visits) {
      if (v.player !== player) continue
      if (member !== undefined && (v.by ?? 0) !== member) continue
      points += v.bust ? 0 : v.score
      darts += v.darts
    }
  }
  return darts > 0 ? Math.round((points / darts) * 300) / 100 : null
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
    const me = m.members.findIndex((side) => side.some((p) => p.trim().toLowerCase() === key))
    if (me < 0) continue
    const member = m.members[me].findIndex((p) => p.trim().toLowerCase() === key)
    const pair = m.members[me].length > 1
    stats.matches++
    if (m.winner === me) stats.matchesWon++
    for (const leg of m.legs) {
      const mine = leg.visits.filter((v) => v.player === me && (!pair || (v.by ?? 0) === member))
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
        // In pairs only your own finish counts, and a leg is not yours alone.
        const finish = leg.visits[leg.visits.length - 1]
        if (!pair || (finish.by ?? 0) === member) stats.highestCheckout = Math.max(stats.highestCheckout, finish.score)
        if (!pair) stats.bestLeg = stats.bestLeg === null ? legDarts : Math.min(stats.bestLeg, legDarts)
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
