import { describe, expect, it } from 'vitest'
import { CHANGELOG } from './changelog'

describe('changelog', () => {
  it('lists the newest change first, with a real date and something to say', () => {
    const dates = CHANGELOG.map((e) => e.date)
    expect([...dates].sort().reverse()).toEqual(dates)
    for (const e of CHANGELOG) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(e.date))).toBe(false)
      expect(e.title.trim()).not.toBe('')
      expect(e.items.length).toBeGreaterThan(0)
    }
  })
})
