import { describe, expect, it } from 'vitest'
import { byPresence, cleanPresenceNote, onlineCount, presenceLabel, presenceStatus, PRESENCE_ONLINE_MS, type PresenceEntry } from './presence'

const now = Date.parse('2026-11-13T15:00:00Z')
const entry = (state: PresenceEntry['state'], ago: number | null, note: string | null = null): PresenceEntry => ({ userId: 'x', state, note, lastSeen: ago === null ? null : now - ago })

describe('wie is er online', () => {
  it('telt alleen een recente ping als online', () => {
    expect(presenceStatus(entry('available', 30_000), now)).toBe('online')
    expect(presenceStatus(entry('busy', 30_000), now)).toBe('busy')
    expect(presenceStatus(entry('available', PRESENCE_ONLINE_MS + 1), now)).toBe('offline')
    expect(presenceStatus(entry('offline', null), now)).toBe('offline')
    expect(presenceStatus(undefined, now)).toBe('offline')
  })

  it('zegt wanneer iemand laatst gezien werd', () => {
    expect(presenceLabel(entry('available', 10_000), now)).toBe('Online')
    expect(presenceLabel(entry('busy', 10_000), now)).toBe('Bezet')
    expect(presenceLabel(entry('available', 5 * 60_000), now)).toBe('Laatst gezien 5 min geleden')
    expect(presenceLabel(entry('busy', 3 * 3600_000), now)).toBe('Laatst gezien 3 uur geleden')
    expect(presenceLabel(entry('available', 30 * 3600_000), now)).toBe('Laatst gezien gisteren')
    expect(presenceLabel(entry('available', 3 * 86400_000), now)).toBe('Laatst gezien 3 dagen geleden')
    expect(presenceLabel(entry('available', 9 * 86400_000), now)).toBe('Offline')
    expect(presenceLabel(entry('offline', null), now)).toBe('Offline')
  })

  it('maakt een status van één korte regel', () => {
    expect(cleanPresenceNote('  Aan het\n studeren ')).toBe('Aan het studeren')
    expect(cleanPresenceNote('   ')).toBeNull()
    expect(cleanPresenceNote('x'.repeat(80))).toHaveLength(60)
  })

  it('zet wie online is bovenaan en telt ze', () => {
    const presence = new Map<string, PresenceEntry>([
      ['b', { ...entry('busy', 1000), userId: 'b' }],
      ['c', { ...entry('available', 1000), userId: 'c' }],
    ])
    const list = [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }]
    expect(byPresence(list, presence, now).map((x) => x.userId)).toEqual(['c', 'b', 'a'])
    expect(onlineCount(['a', 'b', 'c'], presence, now)).toBe(2)
  })
})
