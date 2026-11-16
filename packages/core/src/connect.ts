/** NEXUS Connect: devices and the notifications they forward to each other. */
import type { PlanToday } from './watchToday'

export type DevicePlatform = 'web' | 'android' | 'desktop'

export interface Device {
  id: string
  name: string
  platform: DevicePlatform
  /** P-256 public key as an uncompressed point, base64. */
  publicKey: string
  createdAt: string
  lastSeenAt: string
  revokedAt: string | null
  /** NEXUS in a browser that can be woken by web push, also when NEXUS is closed there. */
  push?: boolean
}

/** What a device sends, before encryption. The server never sees these fields. */
export interface ConnectPayload {
  v: 1
  kind: 'notification' | 'test'
  /** Android package name, or "nexus" for NEXUS' own messages. */
  app: string
  appName: string
  title: string
  /** Absent when the sender only shares titles for this app. */
  text?: string
  postedAt: number
  /** Ties a notification to a notice in the phone's safety net (see safetyNet.ts), so it shows once. */
  ref?: string
  /** Web push only: the buttons to show (pushActions.ts) and the token they send back. */
  actions?: Array<'done' | 'later'>
  actionToken?: string
}

/** The phone's safety net: the notifications NEXUS will send it soon. Replaces the previous plan of the sender. */
export interface PlanPayload {
  v: 1
  kind: 'plan'
  items: Array<{ ref: string; at: number; title: string; text?: string }>
  sentAt: number
  /** The Gaming timer, so the watch shows whether it runs; absent from older NEXUS versions. */
  gaming?: PlanGaming | null
  /** Today's weather of your first place in Weer, for the watch tile; absent when Weer is off. */
  weather?: PlanWeather | null
  /** Vandaag on the watch: agenda, habits and goals of today; absent when there is nothing. */
  today?: PlanToday | null
  /** Darts online on the watch: your matches that are being played; absent when there are none. */
  darts?: PlanDartsGame[]
}

/** An online darts match against a friend, for the watch (dartsForWatch in dartsOnline.ts). */
export interface PlanDartsGame {
  id: string
  opponent: string
  mode: number
  doubleOut: boolean
  /** What you still need in this leg, and what the other one still needs. */
  me: number
  them: number
  myTurn: boolean
  /** The number of visits so far; the watch sends it back with its visit, so a visit counts once. */
  seq: number
  /** Legs (or sets) won, yours first, like "1–0". */
  score: string
  line: string
}

export interface PlanWeather {
  place: string
  /** Now, rounded to whole degrees. */
  temp: number
  min: number
  max: number
  rainChance: number
  /** In Dutch, like "Lichte regen". */
  label: string
  icon: string
  /** When the forecast was fetched; the watch hides it when it gets old. */
  at: number
}

export interface PlanGaming {
  game: string
  startedAt: number
}

/**
 * Something done on another device. "done": a deadline or habit ticked off on the watch; the [ref] is
 * the one of the notice it came from (deadline:<id>@... or habit:<id>@<date>). "focus": a focus round
 * finished on the watch, for the focus log of Studie and Inzichten. "gaming": the Gaming timer started or
 * stopped on the watch. "darts": a solo leg scored on the watch, for the history and stats of Darts.
 * "darts_practice": a practice round played on the watch (Around the Clock, Doubles rond, Bob's 27
 * or Scoring), for Darts › Oefenen; NEXUS replays it with its own rules. "darts_online": your visit in
 * an online match against a friend, entered on the watch; [seq] is the number of visits the watch saw,
 * so a visit sent twice or after the other one threw counts once at most.
 */
export type ActionPayload =
  | { v: 1; kind: 'action'; action: 'done'; ref: string; at: number }
  | { v: 1; kind: 'action'; action: 'focus'; minutes: number; task: string; at: number }
  | { v: 1; kind: 'action'; action: 'gaming'; op: 'start' | 'stop'; at: number }
  | { v: 1; kind: 'action'; action: 'darts'; id: string; mode: 301 | 501; startedAt: number; visits: Array<{ score: number; darts: number }>; at: number }
  | { v: 1; kind: 'action'; action: 'darts_practice'; id: string; game: WatchPracticeGame; startedAt: number; throws: boolean[]; hits: number[]; visits: number[]; at: number }
  | { v: 1; kind: 'action'; action: 'darts_online'; id: string; seq: number; score: number; darts: number; at: number }

/** The practice games the watch can play. */
export type WatchPracticeGame = 'clock' | 'doubles' | 'bobs27' | 'scoring'
export const WATCH_PRACTICE_GAMES: WatchPracticeGame[] = ['clock', 'doubles', 'bobs27', 'scoring']

export type ActionTarget = { kind: 'deadline'; id: string } | { kind: 'habit'; id: string; date: string }

export function parseAction(value: unknown): ActionPayload | null {
  if (typeof value !== 'object' || value === null) return null
  const p = value as Record<string, unknown>
  if (p.v !== 1 || p.kind !== 'action' || typeof p.at !== 'number' || !Number.isFinite(p.at)) return null
  if (p.action === 'done') {
    const ref = str(p.ref, 300)
    return ref ? { v: 1, kind: 'action', action: 'done', ref, at: p.at } : null
  }
  if (p.action === 'focus' && typeof p.minutes === 'number' && Number.isInteger(p.minutes) && p.minutes >= 1 && p.minutes <= 180) {
    return { v: 1, kind: 'action', action: 'focus', minutes: p.minutes, task: str(p.task, 160) ?? '', at: p.at }
  }
  if (p.action === 'gaming' && (p.op === 'start' || p.op === 'stop')) {
    return { v: 1, kind: 'action', action: 'gaming', op: p.op, at: p.at }
  }
  if (p.action === 'darts' && (p.mode === 301 || p.mode === 501) && Array.isArray(p.visits)) {
    const id = str(p.id, 80)
    const startedAt = typeof p.startedAt === 'number' && Number.isFinite(p.startedAt) ? p.startedAt : p.at
    const visits = p.visits.slice(0, 100).flatMap((x) => {
      const v = x as Record<string, unknown> | null
      return v && typeof v.score === 'number' && Number.isInteger(v.score) && v.score >= 0 && v.score <= 180
        ? [{ score: v.score, darts: typeof v.darts === 'number' && v.darts >= 1 && v.darts <= 3 ? Math.round(v.darts) : 3 }]
        : []
    })
    return id && visits.length > 0 ? { v: 1, kind: 'action', action: 'darts', id, mode: p.mode, startedAt, visits, at: p.at } : null
  }
  if (p.action === 'darts_practice' && WATCH_PRACTICE_GAMES.includes(p.game as WatchPracticeGame)) {
    const id = str(p.id, 80)
    const startedAt = typeof p.startedAt === 'number' && Number.isFinite(p.startedAt) ? p.startedAt : p.at
    const ints = (raw: unknown, max: number, top: number) =>
      (Array.isArray(raw) ? raw : []).slice(0, max).filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= top)
    const throws = (Array.isArray(p.throws) ? p.throws : []).slice(0, 500).map((t) => t === true)
    const hits = ints(p.hits, 21, 3)
    const visits = ints(p.visits, 10, 180)
    const any = throws.length + hits.length + visits.length > 0
    return id && any ? { v: 1, kind: 'action', action: 'darts_practice', id, game: p.game as WatchPracticeGame, startedAt, throws, hits, visits, at: p.at } : null
  }
  if (p.action === 'darts_online') {
    const id = str(p.id, 80)
    const int = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
    if (!id || !int(p.seq, 0, 10000) || !int(p.score, 0, 180)) return null
    const darts = int(p.darts, 1, 3) ? (p.darts as number) : 3
    return { v: 1, kind: 'action', action: 'darts_online', id, seq: p.seq as number, score: p.score as number, darts, at: p.at }
  }
  return null
}

/** What a notice ref points at, when it can be ticked off: a deadline or a habit on one day. */
export function actionTarget(ref: string): ActionTarget | null {
  const deadline = /^deadline:([^@]+)@/.exec(ref)
  if (deadline) return { kind: 'deadline', id: deadline[1] }
  const habit = /^habit:([^@]+)@(\d{4}-\d{2}-\d{2})$/.exec(ref)
  if (habit) return { kind: 'habit', id: habit[1], date: habit[2] }
  return null
}

/** A received notification as kept on the device (never in the cloud). */
export interface InboxItem extends ConnectPayload {
  id: string
  fromDeviceId: string
  receivedAt: number
  read: boolean
}

const MAX_FIELD = 4000

function str(value: unknown, max = MAX_FIELD): string | null {
  return typeof value === 'string' ? value.slice(0, max) : null
}

/** Validates a decrypted payload; anything malformed is dropped rather than shown. */
export function parsePayload(value: unknown): ConnectPayload | null {
  if (typeof value !== 'object' || value === null) return null
  const p = value as Record<string, unknown>
  const app = str(p.app, 200)
  const appName = str(p.appName, 200)
  const title = str(p.title)
  if (p.v !== 1 || (p.kind !== 'notification' && p.kind !== 'test') || app === null || appName === null || title === null) {
    return null
  }
  if (typeof p.postedAt !== 'number' || !Number.isFinite(p.postedAt)) return null
  const text = str(p.text)
  const ref = str(p.ref, 300)
  return { v: 1, kind: p.kind, app, appName, title, ...(text !== null ? { text } : {}), postedAt: p.postedAt, ...(ref !== null ? { ref } : {}) }
}

/** Newest first, optionally narrowed to one app and a search term over app, title and text. */
export function filterInbox(items: InboxItem[], { app, query }: { app?: string | null; query?: string } = {}): InboxItem[] {
  const q = query?.trim().toLocaleLowerCase('nl') ?? ''
  return items
    .filter((i) => !app || i.app === app)
    .filter(
      (i) => !q || [i.appName, i.title, i.text ?? ''].some((field) => field.toLocaleLowerCase('nl').includes(q)),
    )
    .sort((a, b) => b.postedAt - a.postedAt || b.receivedAt - a.receivedAt)
}

/** Apps that appear in the inbox, for the filter list, most frequent first. */
export function inboxApps(items: InboxItem[]): Array<{ app: string; appName: string; count: number }> {
  const byApp = new Map<string, { app: string; appName: string; count: number }>()
  for (const i of items) {
    const entry = byApp.get(i.app) ?? { app: i.app, appName: i.appName, count: 0 }
    entry.count++
    byApp.set(i.app, entry)
  }
  return [...byApp.values()].sort((a, b) => b.count - a.count || a.appName.localeCompare(b.appName, 'nl'))
}

/** Keeps the inbox bounded to the `max` most recently received items. */
export function trimInbox(items: InboxItem[], max: number): InboxItem[] {
  if (items.length <= max) return items
  const sorted = [...items].sort((a, b) => b.receivedAt - a.receivedAt)
  return sorted.slice(0, max)
}

export const PLATFORM_LABELS: Record<DevicePlatform, string> = {
  web: 'Webbrowser',
  android: 'Android',
  desktop: 'Windows-app',
}

/** A readable default name for this browser, e.g. "Chrome op Windows". */
export function defaultDeviceName(userAgent: string): string {
  const os = /Android/i.test(userAgent)
    ? 'Android'
    : /iPhone|iPad/i.test(userAgent)
      ? 'iOS'
      : /Windows/i.test(userAgent)
        ? 'Windows'
        : /Mac OS X/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : null
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Browser'
  return os ? `${browser} op ${os}` : browser
}
