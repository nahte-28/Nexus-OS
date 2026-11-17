import { describe, expect, it, vi } from 'vitest'
import { habitsStore } from '../habits/store'
import { focusStore } from '../study/timer'
import { dartsStore } from '../darts/store'
import { emptyDarts } from '@nexus/core'
import { applyAction } from './actions'
import { dartsWatchStore, setDartsWatchApi } from '../darts/watch'
import type { OnlineGame, TogetherSession } from '@nexus/core'
import { setTogetherWatchApi, togetherWatchStore } from '../study/watch'

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

  it('puts a practice round from the watch in Oefenen, once', async () => {
    dartsStore.adopt(emptyDarts())
    const action = { v: 1 as const, kind: 'action' as const, action: 'darts_practice' as const, id: 'p1', game: 'clock' as const, startedAt: 1, throws: [true, false, true], hits: [], visits: [], at: 3 }
    await applyAction(action)
    await applyAction({ ...action, throws: [false] })
    const practice = dartsStore.getSnapshot().practice
    expect(practice).toHaveLength(1)
    expect(practice[0]).toMatchObject({ id: 'watch-p1', game: 'clock', throws: [true, false, true], finishedAt: 3 })
  })

  it('adds your online visit from the watch to the match, and counts a stale one once', async () => {
    const game: OnlineGame = { id: 'g1', side: 0, players: ['Ethan', 'Remo'], mode: 101, legsToWin: 1, setsToWin: 1, doubleOut: true, status: 'playing', visits: [], createdAt: 1, updatedAt: 2 }
    const api = {
      list: vi.fn(async () => [game]),
      end: vi.fn(async () => {}),
      throwVisit: vi.fn(async (_id: string, seq: number, score: number, darts: number) => {
        if (seq !== game.visits.length) throw new Error('De stand veranderde intussen. Kijk opnieuw en probeer nog eens.')
        game.visits = [...game.visits, { side: 0, score, darts }]
      }),
    }
    setDartsWatchApi(api)
    const visit = { v: 1 as const, kind: 'action' as const, action: 'darts_online' as const, id: 'g1', seq: 0, score: 60, darts: 3, at: 5 }
    await applyAction(visit)
    await applyAction(visit)
    expect(api.throwVisit).toHaveBeenCalledTimes(2)
    expect(game.visits).toEqual([{ side: 0, score: 60, darts: 3 }])
    expect(dartsWatchStore.getSnapshot()).toMatchObject([{ id: 'g1', me: 41, them: 101, myTurn: false, seq: 1 }])
    setDartsWatchApi(null)
  })
  it('joins and leaves a Samen studeren session from the watch', async () => {
    const session: TogetherSession = { id: 's1', title: 'Wiskunde', focus: 25, break: 5, startedAt: 1, host: 'Remo', mine: false, joined: false, members: [{ name: 'Remo', me: false }] }
    const api = {
      list: vi.fn(async () => [session]),
      join: vi.fn(async () => {
        session.joined = true
        session.members = [...session.members, { name: 'Ethan', me: true }]
      }),
      leave: vi.fn(async () => {
        session.joined = false
        session.members = session.members.filter((m) => !m.me)
      }),
    }
    setTogetherWatchApi(api)
    await applyAction({ v: 1, kind: 'action', action: 'together', id: 's1', op: 'join', at: 5 })
    expect(api.join).toHaveBeenCalledWith('s1')
    expect(togetherWatchStore.getSnapshot()).toMatchObject([{ id: 's1', joined: true, members: ['Remo'] }])
    await applyAction({ v: 1, kind: 'action', action: 'together', id: 's1', op: 'leave', at: 6 })
    expect(api.leave).toHaveBeenCalledWith('s1')
    expect(togetherWatchStore.getSnapshot()).toMatchObject([{ id: 's1', joined: false }])
    setTogetherWatchApi(null)
  })
})
