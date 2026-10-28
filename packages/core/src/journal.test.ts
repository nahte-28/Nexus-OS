import { describe, expect, it } from 'vitest'
import { mergeJournal, moodWeeks, parseJournalState, type JournalEntry } from './journal'

const entry = (date: string, mood: JournalEntry['mood'], updatedAt = 1): JournalEntry => ({ date, mood, note: '', updatedAt, deletedAt: null })

describe('journal', () => {
  it('averages the mood per week, oldest first', () => {
    const now = new Date(2026, 9, 28, 12).getTime() // a Wednesday
    const s = { entries: [entry('2026-10-26', 4), entry('2026-10-27', 5), entry('2026-10-20', 2)], revision: 0 }
    expect(moodWeeks(s, now, 3)).toEqual([
      { monday: '2026-10-12', average: null, days: 0 },
      { monday: '2026-10-19', average: 2, days: 1 },
      { monday: '2026-10-26', average: 4.5, days: 2 },
    ])
  })

  it('merges by day, the newer write wins, and drops junk', () => {
    const merged = mergeJournal({ entries: [entry('2026-10-26', 1, 5)], revision: 1 }, { entries: [entry('2026-10-26', 4, 9), entry('2026-10-27', 3)], revision: 2 })
    expect(merged.entries.map((e) => [e.date, e.mood])).toEqual([['2026-10-26', 4], ['2026-10-27', 3]])
    expect(parseJournalState({ entries: [{ date: 'gisteren', updatedAt: 1 }, { date: '2026-10-01', mood: 9, updatedAt: 1 }] }).entries).toEqual([{ date: '2026-10-01', mood: null, note: '', updatedAt: 1, deletedAt: null }])
  })
})
