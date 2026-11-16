// Samen studeren: a shared focus session with friends and teammates. Everyone counts the same
// focus and break blocks from the start time, so no device has to send ticks. Pure logic.

export interface TogetherMember {
  name: string
  me: boolean
}

export interface TogetherSession {
  id: string
  title: string
  focus: number
  break: number
  startedAt: number
  host: string
  mine: boolean
  joined: boolean
  members: TogetherMember[]
}

export interface TogetherPhase {
  phase: 'focus' | 'break'
  /** 1-based number of the focus block (a break belongs to the block before it). */
  round: number
  /** Milliseconds left in this block, and when it ends. */
  left: number
  endsAt: number
}

export const TOGETHER_FOCUS = [25, 45, 50, 90]
export const TOGETHER_BREAK = [5, 10, 15]
export const TOGETHER_POLL_MS = 15_000
export const TOGETHER_TITLE_MAX = 60

/** Where the shared timer is at [now]: focus, then break, again and again from the start. */
export function togetherPhase(s: Pick<TogetherSession, 'focus' | 'break' | 'startedAt'>, now: number): TogetherPhase {
  const focus = s.focus * 60_000
  const cycle = focus + s.break * 60_000
  const since = Math.max(0, now - s.startedAt)
  const n = Math.floor(since / cycle)
  const inCycle = since - n * cycle
  const start = s.startedAt + n * cycle
  return inCycle < focus ? { phase: 'focus', round: n + 1, left: focus - inCycle, endsAt: start + focus } : { phase: 'break', round: n + 1, left: cycle - inCycle, endsAt: start + cycle }
}

/** Focus blocks finished since [from] (e.g. when you joined), as their 1-based numbers. */
export function finishedRounds(s: Pick<TogetherSession, 'focus' | 'break' | 'startedAt'>, from: number, now: number): number[] {
  const cycle = (s.focus + s.break) * 60_000
  const out: number[] = []
  for (let r = 1; r <= 100; r++) {
    const end = s.startedAt + (r - 1) * cycle + s.focus * 60_000
    if (end > now) break
    if (end > from) out.push(r)
  }
  return out
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const minutes = (v: unknown, allowed: [number, number], fallback: number) => (typeof v === 'number' && Number.isInteger(v) && v >= allowed[0] && v <= allowed[1] ? v : fallback)

/** The list from study_sessions_list, keeping only what makes sense. */
export function parseTogether(raw: unknown): TogetherSession[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((x): TogetherSession[] => {
    const r = x as Record<string, unknown> | null
    const id = str(r?.id, 64)
    const startedAt = typeof r?.startedAt === 'string' ? Date.parse(r.startedAt) : NaN
    if (!r || !id || !Number.isFinite(startedAt)) return []
    const members = (Array.isArray(r.members) ? r.members : []).flatMap((m): TogetherMember[] => {
      const v = m as Record<string, unknown> | null
      const name = str(v?.name, 40)
      return name ? [{ name, me: v?.me === true }] : []
    })
    return [{ id, title: str(r.title, TOGETHER_TITLE_MAX) || 'Samen studeren', focus: minutes(r.focus, [5, 90], 25), break: minutes(r.break, [1, 30], 5), startedAt, host: str(r.host, 40) || 'Zonder naam', mine: r.mine === true, joined: r.joined === true, members }]
  })
}

/** "12:05" for a time left. */
export function togetherClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
