import { describe, expect, it } from 'vitest'
import { addSyncRun, agoText, MAX_SYNC_RUNS, OFFLINE_MODULES, offlineSummary, parseSyncRuns, type SyncRun } from './offline'

const run = (id: string, at: number, over: Partial<SyncRun> = {}): SyncRun => ({ id, at, channel: 'notes', label: 'Notities', outcome: 'ok', detail: '', ...over })

describe('offline', () => {
  it('leaves out a failure that repeats the last one of that channel', () => {
    let runs = addSyncRun([], run('a', 1, { outcome: 'failed', detail: 'Geen internet' }))
    runs = addSyncRun(runs, run('b', 2, { outcome: 'failed', detail: 'Geen internet' }))
    runs = addSyncRun(runs, run('c', 3, { channel: 'life', outcome: 'failed', detail: 'Geen internet' }))
    expect(runs.map((r) => r.id)).toEqual(['c', 'a'])
    runs = addSyncRun(runs, run('d', 4))
    runs = addSyncRun(runs, run('e', 5, { outcome: 'failed', detail: 'Geen internet' }))
    expect(runs.map((r) => r.id)).toEqual(['e', 'd', 'c', 'a'])
    for (let i = 0; i < MAX_SYNC_RUNS + 3; i++) runs = addSyncRun(runs, run(`x${i}`, 10 + i))
    expect(runs).toHaveLength(MAX_SYNC_RUNS)
  })

  it('sums up what waits, what fails and what was merged this week', () => {
    const day = 86_400_000
    const s = offlineSummary(
      [
        { id: 'notes', label: 'Notities', pending: 2, lastOkAt: 5, error: null },
        { id: 'life', label: 'Agenda', pending: 1, lastOkAt: 9, error: 'x' },
        { id: 'flows', label: 'Flows', pending: 0, lastOkAt: null, error: null },
      ],
      [run('a', 10 * day, { outcome: 'merged' }), run('b', 1 * day, { outcome: 'merged' })],
      11 * day,
    )
    expect(s).toEqual({ pending: 3, failing: 1, merges: 1, lastOkAt: 9 })
  })

  it('parses only valid runs and lists every module once', () => {
    expect(parseSyncRuns([run('a', 1), { id: 'b', at: 2, channel: 'x', outcome: 'weird' }, null])).toEqual([run('a', 1)])
    expect(new Set(OFFLINE_MODULES.map((m) => m.app)).size).toBe(OFFLINE_MODULES.length)
  })

  it('says how long ago', () => {
    expect(agoText(null, 0)).toBe('nog nooit')
    expect(agoText(0, 30_000)).toBe('net')
    expect(agoText(0, 5 * 60_000)).toBe('5 min geleden')
    expect(agoText(0, 2 * 3600_000)).toBe('2 u geleden')
  })
})
