/**
 * Samen vrij moment zoeken: each NEXUS shares with friends only when you are busy in the coming
 * two weeks (lessons, appointments and linked calendars), never what. NEXUS then looks for times
 * when you and the friends you pick are all free.
 */
import { agendaDay, type AgendaInput } from './life'

/** A busy block: start and end in ms. */
export type BusyBlock = [number, number]

export const FREE_BUSY_DAYS = 14
export const FREE_BUSY_MAX_BLOCKS = 500
/** Blocks are rounded out to quarters of an hour, so they show less than the agenda itself. */
const QUARTER = 15 * 60_000

/** Sorted, merged blocks; overlapping or touching ones become one. */
export function mergeBlocks(blocks: BusyBlock[]): BusyBlock[] {
  const sorted = blocks.filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s).sort((a, b) => a[0] - b[0])
  const out: BusyBlock[] = []
  for (const [s, e] of sorted) {
    const last = out[out.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }
  return out
}

/** Local midnight of the day of [at]. */
function dayStartOf(at: number): number {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function addDays(dayStart: number, n: number): number {
  const d = new Date(dayStart)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

/**
 * When you are busy from [from] for [days] days: lessons, appointments and calendar events, rounded
 * out to quarters and merged. Deadlines and reminders are moments, not busy time. [skip] leaves one
 * appointment out (the one you are planning).
 */
export function busyBlocks(input: AgendaInput, from: number, days = FREE_BUSY_DAYS, skip?: string): BusyBlock[] {
  const blocks: BusyBlock[] = []
  const first = dayStartOf(from)
  for (let i = 0; i < days; i++) {
    for (const e of agendaDay(input, addDays(first, i))) {
      if (e.kind === 'deadline' || e.kind === 'reminder') continue
      if (e.kind === 'appointment' && e.appointment.id === skip) continue
      if (e.end <= from) continue
      blocks.push([Math.floor(e.at / QUARTER) * QUARTER, Math.ceil(e.end / QUARTER) * QUARTER])
    }
  }
  return mergeBlocks(blocks).slice(0, FREE_BUSY_MAX_BLOCKS)
}

export function parseBlocks(raw: unknown): BusyBlock[] {
  if (!Array.isArray(raw)) return []
  const blocks = raw.slice(0, FREE_BUSY_MAX_BLOCKS).flatMap((b): BusyBlock[] => {
    if (!Array.isArray(b) || b.length !== 2) return []
    const [s, e] = b
    return typeof s === 'number' && typeof e === 'number' && Number.isFinite(s) && Number.isFinite(e) && e > s ? [[s, e]] : []
  })
  return mergeBlocks(blocks)
}

/** A friend's busy times, as the database gives them; [shares] is false when they turned it off. */
export interface FriendBusy {
  user: string
  name: string
  shares: boolean
  blocks: BusyBlock[]
  /** Until when the blocks reach; after that NEXUS knows nothing. */
  until: number
  updatedAt: number
}

const time = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? v : NaN)

export function parseFriendBusy(raw: unknown): FriendBusy[] {
  return (Array.isArray(raw) ? raw : []).flatMap((x): FriendBusy[] => {
    const r = x as Record<string, unknown> | null
    if (!r || typeof r.user !== 'string' || typeof r.name !== 'string' || !r.name.trim()) return []
    const until = time(r.until)
    const updatedAt = time(r.updatedAt)
    return [
      {
        user: r.user,
        name: r.name.trim().slice(0, 40),
        shares: r.shares === true,
        blocks: parseBlocks(r.blocks),
        until: Number.isFinite(until) ? until : 0,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
      },
    ]
  })
}

export interface FreeSlotOptions {
  /** How long the moment must be. */
  minutes: number
  from: number
  days?: number
  /** Only between these local hours. */
  earliest?: string
  latest?: string
  /** At most this many suggestions, at most [perDay] on one day. */
  max?: number
  perDay?: number
}

/** A free moment for everyone: start and end in ms. */
export interface FreeSlot {
  start: number
  end: number
}

function atTime(dayStart: number, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(dayStart)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

/**
 * Moments of [minutes] when nobody in [busy] (yours and your friends' blocks) is busy, between the
 * local hours [earliest] and [latest], starting on the quarter. [until] is the time after which
 * not every one of them shared their agenda, so nothing is suggested past it.
 */
export function commonFreeSlots(busy: BusyBlock[][], { minutes, from, days = 7, earliest = '09:00', latest = '22:00', max = 6, perDay = 2 }: FreeSlotOptions, until = Infinity): FreeSlot[] {
  const length = Math.max(15, Math.round(minutes)) * 60_000
  const all = mergeBlocks(busy.flat())
  const start = Math.ceil(from / QUARTER) * QUARTER
  const out: FreeSlot[] = []
  const first = dayStartOf(from)
  for (let i = 0; i < days && out.length < max; i++) {
    const day = addDays(first, i)
    const open = Math.max(atTime(day, earliest), start)
    const close = Math.min(atTime(day, latest), until)
    let cursor = open
    let today = 0
    for (const [s, e] of [...all.filter(([s, e]) => e > open && s < close), [close, close] as BusyBlock]) {
      if (s - cursor >= length && today < perDay && out.length < max) {
        out.push({ start: cursor, end: cursor + length })
        today++
      }
      cursor = Math.max(cursor, e)
    }
  }
  return out
}
