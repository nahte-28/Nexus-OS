import { describe, expect, it } from 'vitest'
import { msToNextMinute } from './useNow'

describe('msToNextMinute', () => {
  it('waits exactly until the next minute starts', () => {
    const at = Date.UTC(2026, 10, 24, 11, 20, 0)
    expect(msToNextMinute(at)).toBe(60_000)
    expect(msToNextMinute(at + 59_000)).toBe(1_000)
    expect(msToNextMinute(at + 12_345)).toBe(47_655)
  })
})
