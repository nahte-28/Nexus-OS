import { describe, expect, it, vi } from 'vitest'
import { countUnread, showBadge, UNREAD_WINDOW_MS, type UnreadSource } from './appBadge'

const now = Date.UTC(2030, 0, 10, 12)

function source(over: Partial<UnreadSource> = {}): UnreadSource {
  return {
    dms: vi.fn(async () => 2),
    teams: vi.fn(async () => ['a', 'b']),
    teamSince: vi.fn(async (id: string) => (id === 'a' ? 3 : 1)),
    ...over,
  }
}

describe('unread badge', () => {
  it('adds unread privéberichten and teamchat since you last read each chat', async () => {
    const s = source()
    const readAt = (id: string) => (id === 'a' ? now - 60_000 : 0)
    expect(await countUnread(s, 'me', { teams: true, dms: true }, now, readAt)).toBe(6)
    expect(s.teamSince).toHaveBeenCalledWith('a', 'me', now - 60_000)
    // A chat never opened here counts only its last week.
    expect(s.teamSince).toHaveBeenCalledWith('b', 'me', now - UNREAD_WINDOW_MS)
  })

  it('leaves out apps that are off and parts that fail', async () => {
    const s = source({ dms: vi.fn(async () => Promise.reject(new Error('geen tabel'))) })
    expect(await countUnread(s, 'me', { teams: true, dms: true }, now, () => 0)).toBe(4)
    expect(await countUnread(s, 'me', { teams: false, dms: true }, now, () => 0)).toBe(0)
    expect(s.teams).toHaveBeenCalledTimes(1)
    const off = source()
    expect(await countUnread(off, 'me', { teams: true, dms: false }, now, () => 0)).toBe(4)
    expect(off.dms).not.toHaveBeenCalled()
  })

  it('sets and clears the number on the icon where the system can', async () => {
    const nav = { setAppBadge: vi.fn(async () => {}), clearAppBadge: vi.fn(async () => {}) }
    expect(await showBadge(5, nav)).toBe(true)
    expect(nav.setAppBadge).toHaveBeenCalledWith(5)
    expect(await showBadge(0, nav)).toBe(true)
    expect(nav.clearAppBadge).toHaveBeenCalled()
    expect(await showBadge(3, {})).toBe(false)
  })
})
