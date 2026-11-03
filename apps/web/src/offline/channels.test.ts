import { describe, expect, it, vi } from 'vitest'
import { getOffline, registerChannel, reportSync, syncAll } from './channels'

describe('offline channels', () => {
  it('shows registered channels with what waits, and syncs them all at once', async () => {
    const syncNow = vi.fn(async () => {})
    const off = registerChannel({ id: 't1', label: 'Test', pending: () => 3, syncNow })
    expect(getOffline().channels.find((c) => c.id === 't1')).toMatchObject({ pending: 3, lastOkAt: null, error: null })
    await syncAll()
    expect(syncNow).toHaveBeenCalled()
    off()
    expect(getOffline().channels.some((c) => c.id === 't1')).toBe(false)
  })

  it('keeps quiet rounds out of the history but remembers failures and merges', () => {
    const off = registerChannel({ id: 't2', label: 'Test 2', pending: () => 0, syncNow: async () => {} })
    const before = getOffline().runs.length
    reportSync('t2', 'Test 2', 'ok', '', 100, true)
    expect(getOffline().runs.length).toBe(before)
    expect(getOffline().channels.find((c) => c.id === 't2')?.lastOkAt).toBe(100)
    reportSync('t2', 'Test 2', 'failed', 'Kapot', 200)
    reportSync('t2', 'Test 2', 'failed', 'Kapot', 300)
    reportSync('t2', 'Test 2', 'merged', 'Samengevoegd', 400)
    expect(getOffline().runs.slice(0, 2).map((r) => r.outcome)).toEqual(['merged', 'failed'])
    expect(getOffline().channels.find((c) => c.id === 't2')).toMatchObject({ error: null, lastOkAt: 400 })
    off()
  })
})
