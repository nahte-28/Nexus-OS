// Week grid: where each agenda entry sits in a day column of the week view.
import type { AgendaEntry } from './life'

/** One block in a day column; top and height are fractions (0..1) of the visible hours. */
export interface GridBlock {
  entry: AgendaEntry
  top: number
  height: number
  /** Side-by-side position when blocks overlap: lane of lanes. */
  lane: number
  lanes: number
}

/** Shortest block height, so a deadline or a five-minute event can still be read and tapped. */
export const MIN_BLOCK_MINUTES = 30

/** First and last hour shown: 8 to 18 by default, wider when something falls outside. */
export function gridHours(days: AgendaEntry[][], dayStarts: number[], from = 8, to = 18): { from: number; to: number } {
  let lo = from
  let hi = to
  days.forEach((entries, i) => {
    for (const e of entries) {
      const start = (e.at - dayStarts[i]) / 3_600_000
      const end = ('end' in e ? e.end - dayStarts[i] : e.at - dayStarts[i] + MIN_BLOCK_MINUTES * 60_000) / 3_600_000
      lo = Math.min(lo, Math.floor(start))
      hi = Math.max(hi, Math.ceil(end))
    }
  })
  return { from: Math.max(0, lo), to: Math.min(24, Math.max(hi, lo + 1)) }
}

/** Lays out one day's entries between [from] and [to] o'clock (hours after [dayStart]). */
export function dayBlocks(entries: AgendaEntry[], dayStart: number, from: number, to: number): GridBlock[] {
  // Wall-clock hours, so the 8 o'clock line stays at 8 on the day the clocks change.
  const origin = new Date(dayStart).setHours(from, 0, 0, 0)
  const span = new Date(dayStart).setHours(to, 0, 0, 0) - origin
  const placed = entries
    .map((entry) => {
      const start = entry.at
      const end = Math.max('end' in entry ? entry.end : start, start + MIN_BLOCK_MINUTES * 60_000)
      return { entry, start, end }
    })
    .sort((a, b) => a.start - b.start || b.end - a.end)
  const blocks: GridBlock[] = []
  // Group entries that overlap (directly or through a chain) and give each a free lane in its group.
  let group: Array<{ block: GridBlock; end: number }> = []
  let groupEnd = -Infinity
  const close = () => {
    const lanes = Math.max(1, ...group.map((g) => g.block.lane + 1))
    for (const g of group) g.block.lanes = lanes
    group = []
  }
  for (const p of placed) {
    if (p.start >= groupEnd) {
      close()
      groupEnd = -Infinity
    }
    const taken = new Set(group.filter((g) => g.end > p.start).map((g) => g.block.lane))
    let lane = 0
    while (taken.has(lane)) lane++
    const top = Math.max(0, (p.start - origin) / span)
    const bottom = Math.min(1, (p.end - origin) / span)
    const block: GridBlock = { entry: p.entry, top, height: Math.max(0, bottom - top), lane, lanes: 1 }
    blocks.push(block)
    group.push({ block, end: p.end })
    groupEnd = Math.max(groupEnd, p.end)
  }
  close()
  return blocks
}

/** The seven local midnights of the week starting at [monday]; setDate keeps them right across a time change. */
export function weekDays(monday: number): number[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return d.getTime()
  })
}
