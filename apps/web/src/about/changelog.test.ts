import { describe, expect, it } from 'vitest'
import type { ChangelogEntry } from './changelog'
import { ENTRIES, ENTRY_FILES, mergeEntries } from './whatsNew'

describe('changelog', () => {
  it('lists the newest change first, with a real date and something to say', () => {
    const dates = ENTRIES.map((e) => e.date)
    expect([...dates].sort().reverse()).toEqual(dates)
    for (const e of ENTRIES) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(e.date))).toBe(false)
      expect(e.title.trim()).not.toBe('')
      expect(e.items.length).toBeGreaterThan(0)
    }
  })

  it('names every entry file after its date', () => {
    for (const [path, entry] of Object.entries(ENTRY_FILES)) {
      expect(path).toMatch(/^\.\/entries\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.ts$/)
      expect(path.slice('./entries/'.length, './entries/'.length + 10)).toBe(entry.date)
    }
  })

  it('puts entry files among the older entries by date, files first on the same day', () => {
    const e = (date: string, title: string): ChangelogEntry => ({ date, title, items: ['x'] })
    const merged = mergeEntries(
      { './entries/2026-11-27-b.ts': e('2026-11-27', 'B'), './entries/2026-11-27-a.ts': e('2026-11-27', 'A'), './entries/2026-12-01-c.ts': e('2026-12-01', 'C') },
      [e('2026-11-27', 'Oud'), e('2026-11-20', 'Ouder')],
    )
    expect(merged.map((m) => m.title)).toEqual(['C', 'B', 'A', 'Oud', 'Ouder'])
  })
})
