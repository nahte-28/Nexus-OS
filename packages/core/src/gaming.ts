/**
 * Gaming Companion: your games, a session log, saved builds and loadouts with notes, and stats from
 * your own sessions. Everything is entered by you: NEXUS reads no game platform and scrapes nothing.
 * An optional weekly limit warns when you play more than you planned. One document per account
 * (user_settings key 'gaming'). Pure logic.
 */
import type { PlannedNotice } from './safetyNet'

export type GameStatus = 'playing' | 'backlog' | 'finished' | 'dropped'
export const GAME_STATUSES: GameStatus[] = ['playing', 'backlog', 'finished', 'dropped']
export const GAME_STATUS_LABELS: Record<GameStatus, string> = { playing: 'Aan het spelen', backlog: 'Wil ik spelen', finished: 'Uitgespeeld', dropped: 'Gestopt' }

export interface Game {
  id: string
  name: string
  /** Free text: pc, PlayStation, Switch, gsm … */
  platform: string
  status: GameStatus
  /** 1 to 5, or null. */
  rating: number | null
  notes: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface GameSession {
  id: string
  gameId: string
  at: number
  minutes: number
  note: string
  updatedAt: number
  deletedAt: number | null
}

export interface GameBuild {
  id: string
  gameId: string
  name: string
  /** The build itself: items, skills, settings … */
  text: string
  tags: string[]
  updatedAt: number
  deletedAt: number | null
}

export interface GamingSettings {
  /** Planned play time per week (Monday to Sunday), or null for no limit. */
  weeklyLimitMinutes: number | null
  /** Slaapbewaker: on an evening before a lesson day, a notice to stop in time. */
  sleepGuard: SleepGuard
  updatedAt: number
}

export interface SleepGuard {
  enabled: boolean
  /** How long you want to sleep. */
  sleepMinutes: number
  /** From waking up to the first lesson (getting ready, travel). */
  prepMinutes: number
  /** The first notice comes this long before the stop time. */
  warnMinutes: number
}

export const DEFAULT_SLEEP_GUARD: SleepGuard = { enabled: true, sleepMinutes: 8 * 60, prepMinutes: 60, warnMinutes: 15 }
export const SLEEP_CHOICES = [7 * 60, 7.5 * 60, 8 * 60, 8.5 * 60, 9 * 60]
export const PREP_CHOICES = [30, 45, 60, 90, 120]
export const WARN_CHOICES = [0, 10, 15, 30]

export function parseSleepGuard(raw: unknown): SleepGuard {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SLEEP_GUARD }
  const r = raw as Partial<SleepGuard>
  const pick = (v: unknown, choices: number[], fallback: number) => (choices.includes(v as number) ? (v as number) : fallback)
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_SLEEP_GUARD.enabled,
    sleepMinutes: pick(r.sleepMinutes, SLEEP_CHOICES, DEFAULT_SLEEP_GUARD.sleepMinutes),
    prepMinutes: pick(r.prepMinutes, PREP_CHOICES, DEFAULT_SLEEP_GUARD.prepMinutes),
    warnMinutes: pick(r.warnMinutes, WARN_CHOICES, DEFAULT_SLEEP_GUARD.warnMinutes),
  }
}

/** A running session of the timer: on every device, so you can stop it on another one. */
export interface ActiveSession {
  gameId: string
  startedAt: number
  /** When this was last changed, for merging two devices. */
  updatedAt: number
}

export interface GamingState {
  games: Game[]
  sessions: GameSession[]
  builds: GameBuild[]
  settings: GamingSettings
  /** The timer that runs now, or null; [activeAt] is when it was last started or stopped. */
  active: ActiveSession | null
  activeAt: number
  revision: number
}

export const MAX_GAMES = 300
export const MAX_GAME_SESSIONS = 2000
export const MAX_BUILDS = 500
const MAX_TEXT = 4000

export const emptyGaming = (): GamingState => ({ games: [], sessions: [], builds: [], settings: { weeklyLimitMinutes: null, sleepGuard: { ...DEFAULT_SLEEP_GUARD }, updatedAt: 0 }, active: null, activeAt: 0, revision: 0 })

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const list = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null && typeof i.id === 'string') : [])

export function parseGaming(raw: unknown): GamingState {
  if (typeof raw !== 'object' || raw === null) return emptyGaming()
  const v = raw as Record<string, unknown>
  const games = list(v.games).map((g): Game => {
    const createdAt = num(g.createdAt) ?? 0
    const rating = num(g.rating)
    return {
      id: g.id as string,
      name: str(g.name, 120),
      platform: str(g.platform, 40),
      status: GAME_STATUSES.includes(g.status as GameStatus) ? (g.status as GameStatus) : 'playing',
      rating: rating !== null && rating >= 1 && rating <= 5 ? Math.round(rating) : null,
      notes: str(g.notes, MAX_TEXT),
      createdAt,
      updatedAt: num(g.updatedAt) ?? createdAt,
      deletedAt: num(g.deletedAt),
    }
  })
  const sessions = list(v.sessions).flatMap((x): GameSession[] => {
    const at = num(x.at)
    const minutes = num(x.minutes)
    if (at === null || minutes === null || typeof x.gameId !== 'string') return []
    return [{ id: x.id as string, gameId: x.gameId, at, minutes: Math.max(1, Math.min(Math.round(minutes), 24 * 60)), note: str(x.note, 300), updatedAt: num(x.updatedAt) ?? at, deletedAt: num(x.deletedAt) }]
  })
  const builds = list(v.builds).flatMap((b): GameBuild[] =>
    typeof b.gameId !== 'string'
      ? []
      : [{ id: b.id as string, gameId: b.gameId, name: str(b.name, 80), text: str(b.text, MAX_TEXT), tags: Array.isArray(b.tags) ? b.tags.filter((t): t is string => typeof t === 'string').map((t) => t.slice(0, 30)).slice(0, 10) : [], updatedAt: num(b.updatedAt) ?? 0, deletedAt: num(b.deletedAt) }],
  )
  const s = (typeof v.settings === 'object' && v.settings !== null ? v.settings : {}) as Record<string, unknown>
  const limit = num(s.weeklyLimitMinutes)
  return {
    games,
    sessions: sessions.sort((a, b) => b.at - a.at).slice(0, MAX_GAME_SESSIONS),
    builds,
    settings: { weeklyLimitMinutes: limit !== null && limit > 0 ? Math.round(limit) : null, sleepGuard: parseSleepGuard(s.sleepGuard), updatedAt: num(s.updatedAt) ?? 0 },
    active: parseActive(v.active),
    activeAt: num(v.activeAt) ?? 0,
    revision: num(v.revision) ?? 0,
  }
}

function parseActive(raw: unknown): ActiveSession | null {
  if (typeof raw !== 'object' || raw === null) return null
  const a = raw as Record<string, unknown>
  const startedAt = num(a.startedAt)
  return typeof a.gameId === 'string' && startedAt !== null ? { gameId: a.gameId, startedAt, updatedAt: num(a.updatedAt) ?? startedAt } : null
}

function mergeById<T extends { id: string; updatedAt: number }>(a: T[], b: T[]): T[] {
  const byId = new Map(a.map((x) => [x.id, x]))
  for (const x of b) {
    const mine = byId.get(x.id)
    if (!mine || x.updatedAt > mine.updatedAt) byId.set(x.id, x)
  }
  return [...byId.values()]
}

export function mergeGaming(a: GamingState, b: GamingState): GamingState {
  return {
    games: mergeById(a.games, b.games),
    sessions: mergeById(a.sessions, b.sessions).sort((x, y) => y.at - x.at).slice(0, MAX_GAME_SESSIONS),
    builds: mergeById(a.builds, b.builds),
    settings: b.settings.updatedAt > a.settings.updatedAt ? b.settings : a.settings,
    ...(b.activeAt > a.activeAt ? { active: b.active, activeAt: b.activeAt } : { active: a.active, activeAt: a.activeAt }),
    revision: Math.max(a.revision, b.revision),
  }
}

// Changing ------------------------------------------------------------------------------------------

export const liveGames = (s: GamingState) => s.games.filter((g) => g.deletedAt === null).sort((a, b) => a.name.localeCompare(b.name, 'nl'))
export const liveSessions = (s: GamingState, gameId?: string) => s.sessions.filter((x) => x.deletedAt === null && (gameId === undefined || x.gameId === gameId)).sort((a, b) => b.at - a.at)
export const liveBuilds = (s: GamingState, gameId?: string) => s.builds.filter((b) => b.deletedAt === null && (gameId === undefined || b.gameId === gameId)).sort((a, b) => a.name.localeCompare(b.name, 'nl'))

export type GameDraft = Pick<Game, 'id' | 'name' | 'platform' | 'status' | 'rating' | 'notes'>

export function saveGame(s: GamingState, draft: GameDraft, now: number): GamingState | { error: string } {
  const name = draft.name.trim().slice(0, 120)
  if (!name) return { error: 'Geef de game een naam.' }
  const old = s.games.find((g) => g.id === draft.id)
  if (!old && liveGames(s).length >= MAX_GAMES) return { error: `Hoogstens ${MAX_GAMES} games.` }
  const rating = draft.rating !== null && draft.rating >= 1 && draft.rating <= 5 ? Math.round(draft.rating) : null
  const entry: Game = { ...draft, name, platform: draft.platform.trim().slice(0, 40), notes: draft.notes.slice(0, MAX_TEXT), rating, createdAt: old?.createdAt ?? now, updatedAt: now, deletedAt: null }
  return { ...s, games: old ? s.games.map((g) => (g.id === draft.id ? entry : g)) : [...s.games, entry] }
}

/** Removes a game with its sessions and builds. */
export function removeGame(s: GamingState, id: string, now: number): GamingState {
  const gone = <T extends { gameId: string; deletedAt: number | null; updatedAt: number }>(x: T): T => (x.gameId === id && x.deletedAt === null ? { ...x, deletedAt: now, updatedAt: now } : x)
  return { ...s, games: s.games.map((g) => (g.id === id ? { ...g, deletedAt: now, updatedAt: now } : g)), sessions: s.sessions.map(gone), builds: s.builds.map(gone) }
}

export function logGameSession(s: GamingState, session: Pick<GameSession, 'id' | 'gameId' | 'at' | 'minutes' | 'note'>, now: number): GamingState | { error: string } {
  if (!s.games.some((g) => g.id === session.gameId && g.deletedAt === null)) return { error: 'Kies een game.' }
  if (!Number.isFinite(session.minutes) || session.minutes < 1 || session.minutes > 24 * 60) return { error: 'Geef een duur tussen 1 minuut en 24 uur.' }
  const entry: GameSession = { ...session, minutes: Math.round(session.minutes), note: session.note.slice(0, 300), updatedAt: now, deletedAt: null }
  return { ...s, sessions: [entry, ...s.sessions].slice(0, MAX_GAME_SESSIONS) }
}

export function removeGameSession(s: GamingState, id: string, now: number): GamingState {
  return { ...s, sessions: s.sessions.map((x) => (x.id === id ? { ...x, deletedAt: now, updatedAt: now } : x)) }
}

export function saveBuild(s: GamingState, build: Pick<GameBuild, 'id' | 'gameId' | 'name' | 'text' | 'tags'>, now: number): GamingState | { error: string } {
  const name = build.name.trim().slice(0, 80)
  if (!name) return { error: 'Geef de build een naam.' }
  if (!s.games.some((g) => g.id === build.gameId && g.deletedAt === null)) return { error: 'Kies een game.' }
  const old = s.builds.find((b) => b.id === build.id)
  if (!old && liveBuilds(s).length >= MAX_BUILDS) return { error: `Hoogstens ${MAX_BUILDS} builds.` }
  const tags = [...new Set(build.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10)
  const entry: GameBuild = { ...build, name, text: build.text.slice(0, MAX_TEXT), tags, updatedAt: now, deletedAt: null }
  return { ...s, builds: old ? s.builds.map((b) => (b.id === build.id ? entry : b)) : [...s.builds, entry] }
}

export function removeBuild(s: GamingState, id: string, now: number): GamingState {
  return { ...s, builds: s.builds.map((b) => (b.id === id ? { ...b, deletedAt: now, updatedAt: now } : b)) }
}

export function setWeeklyLimit(s: GamingState, minutes: number | null, now: number): GamingState {
  return { ...s, settings: { ...s.settings, weeklyLimitMinutes: minutes !== null && minutes > 0 ? Math.round(minutes) : null, updatedAt: now } }
}

export function setSleepGuard(s: GamingState, change: Partial<SleepGuard>, now: number): GamingState {
  return { ...s, settings: { ...s.settings, sleepGuard: parseSleepGuard({ ...s.settings.sleepGuard, ...change }), updatedAt: now } }
}

// Timer ---------------------------------------------------------------------------------------------

/** Starts the timer for a game; a timer that already runs is stopped and logged first. */
export function startGameTimer(s: GamingState, gameId: string, now: number, newId: () => string): GamingState | { error: string } {
  if (!s.games.some((g) => g.id === gameId && g.deletedAt === null)) return { error: 'Kies een game.' }
  const base = s.active ? stopGameTimer(s, now, newId).state : s
  return { ...base, active: { gameId, startedAt: now, updatedAt: now }, activeAt: now }
}

/**
 * Stops the timer and logs the session (at least a minute; a timer left running counts for at
 * most 12 hours). [minutes] is 0 when nothing was running or the game is gone.
 */
export function stopGameTimer(s: GamingState, now: number, newId: () => string): { state: GamingState; minutes: number } {
  const a = s.active
  if (!a) return { state: s, minutes: 0 }
  const cleared: GamingState = { ...s, active: null, activeAt: now }
  const minutes = Math.min(12 * 60, Math.max(1, Math.round((now - a.startedAt) / 60_000)))
  const logged = logGameSession(cleared, { id: newId(), gameId: a.gameId, at: a.startedAt, minutes, note: 'Met de timer' }, now)
  return 'error' in logged ? { state: cleared, minutes: 0 } : { state: logged, minutes }
}

/** Minutes the timer has run so far. */
export const gameTimerMinutes = (s: GamingState, now: number) => (s.active ? Math.max(0, Math.floor((now - s.active.startedAt) / 60_000)) : 0)

// Slaapbewaker --------------------------------------------------------------------------------------

export interface SleepPlan {
  /** The first lesson of the next lesson day after [now]'s evening. */
  firstLesson: { start: number; subject: string }
  /** When to stop playing: first lesson - prep - sleep. */
  stopAt: number
  warnAt: number
}

/**
 * Tonight's stop time, when tomorrow (or tonight after midnight) has a lesday: the first lesson that
 * starts between 3 and 18 hours from [now] counts. Null without lessons or when switched off.
 */
export function sleepPlan(guard: SleepGuard, lessons: Array<{ start: number; subject: string }>, now: number): SleepPlan | null {
  if (!guard.enabled) return null
  const first = lessons
    .filter((l) => l.start > now && l.start - now <= 18 * 3_600_000)
    .sort((a, b) => a.start - b.start)[0]
  if (!first) return null
  const stopAt = first.start - (guard.prepMinutes + guard.sleepMinutes) * 60_000
  if (stopAt - now > 12 * 3_600_000 || first.start - now < 3 * 3_600_000) return null
  return { firstLesson: first, stopAt, warnAt: stopAt - guard.warnMinutes * 60_000 }
}

type SleepKind = 'warn' | 'stop'

/** The text of the warning or the stop notice, with the ref that keeps it to one per night. */
function sleepText(plan: SleepPlan, kind: SleepKind): { kind: SleepKind; ref: string; title: string; text: string } {
  const clock = (t: number) => new Date(t).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
  const day = new Date(plan.firstLesson.start).toISOString().slice(0, 10)
  if (kind === 'stop') {
    return { kind, ref: `sleep:${day}:stop`, title: 'Tijd om te stoppen', text: `Morgen ${plan.firstLesson.subject} om ${clock(plan.firstLesson.start)}. Slaapwel!` }
  }
  return { kind, ref: `sleep:${day}:warn`, title: `Nog ${Math.round((plan.stopAt - plan.warnAt) / 60_000)} minuten gamen`, text: `Stop om ${clock(plan.stopAt)}: morgen ${plan.firstLesson.subject} om ${clock(plan.firstLesson.start)}.` }
}

/** The notice due in (from, now], with a ref so it comes once. */
export function sleepNotice(plan: SleepPlan | null, from: number, now: number): { kind: SleepKind; ref: string; title: string; text: string } | null {
  if (!plan) return null
  if (plan.stopAt > from && plan.stopAt <= now) return sleepText(plan, 'stop')
  if (plan.warnAt < plan.stopAt && plan.warnAt > from && plan.warnAt <= now) return sleepText(plan, 'warn')
  return null
}

/**
 * Tonight's warning and stop notice for the phone and watch safety net, so they come when NEXUS is
 * closed too (same refs as sleepNotice, so never twice). Only while you are gaming.
 */
export function plannedSleepNotices(plan: SleepPlan | null, gaming: boolean, now: number): PlannedNotice[] {
  if (!plan || !gaming) return []
  const kinds: Array<[SleepKind, number]> = [['warn', plan.warnAt], ['stop', plan.stopAt]]
  return kinds
    .filter(([kind, at]) => at > now && (kind === 'stop' || plan.warnAt < plan.stopAt))
    .map(([kind, at]) => {
      const { ref, title, text } = sleepText(plan, kind)
      return { ref, at, title, text }
    })
}

/** The game a timer started on the watch is for: the last one played, else the first one you are playing. */
export function gameForWatch(s: GamingState): Game | null {
  const live = s.games.filter((g) => g.deletedAt === null)
  const last = liveSessions(s)[0]
  return live.find((g) => g.id === last?.gameId) ?? live.find((g) => g.status === 'playing') ?? live[0] ?? null
}

// Stats ---------------------------------------------------------------------------------------------

/** Local Monday 00:00 of the week of [t]. */
export function weekStart(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

const nextWeek = (start: number) => {
  const d = new Date(start)
  d.setDate(d.getDate() + 7)
  return d.getTime()
}

export function minutesBetween(s: GamingState, from: number, to: number, gameId?: string): number {
  return liveSessions(s, gameId)
    .filter((x) => x.at >= from && x.at < to)
    .reduce((sum, x) => sum + x.minutes, 0)
}

export interface GamingWeek {
  start: number
  minutes: number
  limit: number | null
  /** Above the weekly limit. */
  over: boolean
  /** At least 80 % of the limit, not over it. */
  near: boolean
}

export function gamingWeek(s: GamingState, now: number): GamingWeek {
  const start = weekStart(now)
  const minutes = minutesBetween(s, start, nextWeek(start))
  const limit = s.settings.weeklyLimitMinutes
  return { start, minutes, limit, over: limit !== null && minutes > limit, near: limit !== null && minutes <= limit && minutes >= limit * 0.8 }
}

/** Minutes per week for the last [weeks] weeks, oldest first. */
export function weeklyMinutes(s: GamingState, now: number, weeks = 8): Array<{ start: number; minutes: number }> {
  const out: Array<{ start: number; minutes: number }> = []
  let start = weekStart(now)
  for (let i = 0; i < weeks; i++) {
    out.unshift({ start, minutes: minutesBetween(s, start, nextWeek(start)) })
    start = weekStart(start - 3 * 86_400_000)
  }
  return out
}

/** Total time, sessions and the last time played, per game; most played first. */
export function gameTotals(s: GamingState): Array<{ game: Game; minutes: number; sessions: number; lastAt: number | null }> {
  return liveGames(s)
    .map((game) => {
      const own = liveSessions(s, game.id)
      return { game, minutes: own.reduce((sum, x) => sum + x.minutes, 0), sessions: own.length, lastAt: own[0]?.at ?? null }
    })
    .sort((a, b) => b.minutes - a.minutes || a.game.name.localeCompare(b.game.name, 'nl'))
}
