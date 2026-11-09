import { afterEach, describe, expect, it } from 'vitest'
import type { ChangelogEntry } from './changelog'
import { entryKey, markChangelogSeen, takeUnseen, unseenEntries } from './seen'

const a: ChangelogEntry = { date: '2026-11-01', title: 'A', items: ['a'] }
const b: ChangelogEntry = { date: '2026-11-05', title: 'B', items: ['b'] }
const c: ChangelogEntry = { date: '2026-11-09', title: 'C', items: ['c'] }

describe('what is new after an update', () => {
  afterEach(() => localStorage.clear())

  it('shows only the entries after the one last seen', () => {
    expect(unseenEntries([c, b, a], { key: entryKey(a), date: a.date })).toEqual([c, b])
    expect(unseenEntries([c, b, a], { key: entryKey(c), date: c.date })).toEqual([])
    // A renamed entry falls back to the date.
    expect(unseenEntries([c, b, a], { key: '2026-11-05|Oud', date: '2026-11-05' })).toEqual([c])
  })

  it('shows nothing on a first run, then what came after', () => {
    expect(takeUnseen([b, a])).toEqual([])
    expect(takeUnseen([c, b, a])).toEqual([c])
    markChangelogSeen([c, b, a])
    expect(takeUnseen([c, b, a])).toEqual([])
  })
})
