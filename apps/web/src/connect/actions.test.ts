import { describe, expect, it } from 'vitest'
import { habitsStore } from '../habits/store'
import { focusStore } from '../study/timer'
import { dartsStore } from '../darts/store'
import { emptyDarts } from '@nexus/core'
import { applyAction } from './actions'

describe('actions from the watch', () => {
  it('ticks a habit off for that day, once', async () => {
    habitsStore.update(() => ({
      revision: 0,
      habits: [{ id: 'h1', name: 'Lezen', days: [1, 2, 3, 4, 5, 6, 7], remindAt: null, target: 'phone', done: [], createdAt: 1, updatedAt: 1, deletedAt: null }],
    }))
    const action = { v: 1, kind: 'action', action: 'done', ref: 'habit:h1@2026-11-03', at: 5 } as const
    await applyAction(action)
    await applyAction(action)
    expect(habitsStore.getSnapshot().habits[0].done).toEqual(['2026-11-03'])
  })

  it('adds a focus round from the watch to the log', async () => {
    const at = Date.now()
    await applyAction({ v: 1, kind: 'action', action: 'focus', minutes: 25, task: '', at })
    expect(focusStore.getSnapshot().log.at(-1)).toEqual({ at, minutes: 25, task: 'Focus op het horloge' })
  })

  it('puts a darts leg from the watch in the history, once', async () => {
    dartsStore.adopt({ ...emptyDarts(), settings: { ...emptyDarts().settings, me: 'Ethan' } })
    const action = { v: 1 as const, kind: 'action' as const, action: 'darts' as const, id: 'w1', mode: 501 as const, startedAt: 1, visits: [{ score: 100, darts: 3 }], at: 2 }
    await applyAction(action)
    await applyAction({ ...action, visits: [{ score: 60, darts: 3 }] })
    const matches = dartsStore.getSnapshot().matches
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ id: 'watch-w1', players: ['Ethan'], finishedAt: 2 })
    expect(matches[0].legs[0].visits[0].score).toBe(100)
  })
})
