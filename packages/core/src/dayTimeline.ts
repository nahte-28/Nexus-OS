import type { AgendaEntry } from './life'

/** Something of today with a start and an end: a lesson, an appointment or a calendar event. */
export type TimedEntry = Extract<AgendaEntry, { end: number }>

export interface TimelineBlock {
  entry: TimedEntry
  /** Where the block starts and how wide it is, as a share (0..1) of the time line. */
  left: number
  width: number
  /** 0 for the first lane; things that overlap go one lane lower. */
  lane: number
}

export interface DayTimeline {
  /** Start and end of the time line: whole hours around everything of the day. */
  from: number
  to: number
  blocks: TimelineBlock[]
  lanes: number
  /** The whole hours to label, as a time and a share of the time line. */
  hours: Array<{ at: number; left: number }>
  /** Where now is on the line (0..1), or null when now is outside it. */
  now: number | null
  current: TimedEntry | null
  next: TimedEntry | null
  /** How many timed things are still to come today, and when the last one ends. */
  left: number
  endsAt: number | null
}

const HOUR = 3_600_000
const isTimed = (e: AgendaEntry): e is TimedEntry => 'end' in e && e.end > e.at

/** Lays out the timed things of one day on a line from the first to the last hour, for Mijn dag. */
export function dayTimeline(entries: AgendaEntry[], now: number): DayTimeline | null {
  const timed = entries.filter(isTimed).sort((a, b) => a.at - b.at || a.end - b.end)
  if (timed.length === 0) return null
  const first = timed[0].at
  const last = Math.max(...timed.map((e) => e.end))
  const from = Math.floor(first / HOUR) * HOUR
  const to = Math.max(from + HOUR, Math.ceil(last / HOUR) * HOUR)
  const span = to - from
  const laneEnds: number[] = []
  const blocks = timed.map((entry) => {
    let lane = laneEnds.findIndex((end) => end <= entry.at)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = entry.end
    return { entry, left: (entry.at - from) / span, width: (entry.end - entry.at) / span, lane }
  })
  const hours: DayTimeline['hours'] = []
  for (let t = from + HOUR; t < to; t += HOUR) hours.push({ at: t, left: (t - from) / span })
  const upcoming = timed.filter((e) => e.at > now)
  return {
    from,
    to,
    blocks,
    lanes: Math.max(1, laneEnds.length),
    hours,
    now: now >= from && now <= to ? (now - from) / span : null,
    current: timed.find((e) => e.at <= now && now < e.end) ?? null,
    next: upcoming[0] ?? null,
    left: upcoming.length,
    endsAt: last > now ? last : null,
  }
}
