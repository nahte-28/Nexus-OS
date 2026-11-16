import { describe, expect, it } from 'vitest'
import { remaining } from './darts'
import { canUndoOnline, myTurn, onlineLine, onlineMatchId, onlineWon, parseOnlineGames, replayOnline, type OnlineGame } from './dartsOnline'

const game = (patch: Partial<OnlineGame> = {}): OnlineGame => ({ id: 'g1', side: 0, players: ['Ethan', 'Remo'], mode: 101, legsToWin: 1, setsToWin: 1, doubleOut: true, status: 'playing', visits: [], createdAt: 1, updatedAt: 2, ...patch })

describe('dartsOnline', () => {
  it('replays the visits in turn and skips one out of turn', () => {
    const g = game({ visits: [{ side: 0, score: 60, darts: 3 }, { side: 0, score: 41, darts: 3 }, { side: 1, score: 45, darts: 3 }] })
    const m = replayOnline(g)
    expect(remaining(m, 0)).toBe(41)
    expect(remaining(m, 1)).toBe(56)
    expect(myTurn(g)).toBe(true)
    expect(myTurn({ ...g, side: 1 })).toBe(false)
    expect(canUndoOnline(g)).toBe(false)
    expect(canUndoOnline({ ...g, side: 1 })).toBe(true)
    expect(onlineLine(g)).toBe('Jij gooit, nog 41.')
    expect(onlineLine({ ...g, side: 1 })).toBe('Ethan gooit, nog 41.')
  })

  it('knows the winner and saves the match under your own name', () => {
    const g = game({ status: 'done', visits: [{ side: 0, score: 60, darts: 3 }, { side: 1, score: 45, darts: 3 }, { side: 0, score: 41, darts: 2, doubles: 1 }] })
    expect(onlineWon(g)).toBe(true)
    expect(onlineLine(g)).toBe('Je won van Remo.')
    expect(onlineLine({ ...g, side: 1 })).toBe('Ethan won.')
    const mine = replayOnline({ ...g, side: 1 }, 'Remo VG')
    expect(mine.id).toBe(onlineMatchId('g1'))
    expect(mine.players).toEqual(['Ethan', 'Remo VG'])
    expect(mine.winner).toBe(0)
    expect(mine.finishedAt).toBe(2)
    // Same name on both sides: the other one gets a marker.
    expect(replayOnline(g, 'Remo').players).toEqual(['Remo', 'Remo (online)'])
  })

  it('reads the list safely', () => {
    const list = parseOnlineGames([
      { id: 'a', side: 1, players: ['Ethan', 'Remo'], mode: 501, legsToWin: 3, setsToWin: 1, doubleOut: true, status: 'invited', visits: [{ side: 0, score: 200, darts: 3 }, { side: 1, score: 60, darts: 3 }], createdAt: '2026-11-16T10:00:00Z', updatedAt: '2026-11-16T10:00:00Z' },
      { id: 'b', side: 2 },
      null,
    ])
    expect(list).toHaveLength(1)
    expect(list[0].visits).toEqual([{ side: 1, score: 60, darts: 3 }])
    expect(list[0].createdAt).toBe(Date.parse('2026-11-16T10:00:00Z'))
    expect(onlineLine(list[0])).toBe('Ethan daagt je uit.')
  })
})
