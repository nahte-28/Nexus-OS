import { describe, expect, it } from 'vitest'
import { newMatch } from './darts'
import { dartsRanking } from './dartsRanking'
import { replayOnline, type OnlineGame } from './dartsOnline'

const game = (id: string, players: [string, string], visits: OnlineGame['visits'], patch: Partial<OnlineGame> = {}): OnlineGame => ({ id, side: 0, players, mode: 101, legsToWin: 1, setsToWin: 1, doubleOut: true, status: 'done', visits, createdAt: 1, updatedAt: 2, ...patch })

// Ethan wins with 60 + 41; Remo threw 45.
const win = (id: string, other: string) => replayOnline(game(id, ['Ethan', other], [{ side: 0, score: 60, darts: 3 }, { side: 1, score: 45, darts: 3 }, { side: 0, score: 41, darts: 3 }]), 'Ethan')
// Remo wins with 61 + 40; Ethan threw 26 twice.
const loss = (id: string, other: string) => replayOnline(game(id, ['Ethan', other], [{ side: 0, score: 26, darts: 3 }, { side: 1, score: 61, darts: 3 }, { side: 0, score: 26, darts: 3 }, { side: 1, score: 40, darts: 3 }]), 'Ethan')

describe('dartsRanking', () => {
  it('ranks you and each friend over your finished online matches', () => {
    const rows = dartsRanking([win('a', 'Remo'), loss('b', 'Remo'), win('c', 'Lotte')], 'Ethan')
    expect(rows.map((r) => r.name)).toEqual(['Ethan', 'Remo', 'Lotte'])
    const me = rows.find((r) => r.me)!
    expect(me).toMatchObject({ matches: 3, won: 2, highestCheckout: 41 })
    const remo = rows.find((r) => r.name === 'Remo')!
    expect(remo).toMatchObject({ matches: 2, won: 1, highestCheckout: 40, head: { mine: 1, theirs: 1 } })
    expect(remo.average).toBeCloseTo((45 + 61 + 40) / 9 * 3, 1)
    expect(rows.find((r) => r.name === 'Lotte')).toMatchObject({ matches: 1, won: 0, head: { mine: 1, theirs: 0 } })
  })

  it('takes the " (online)" marker off a friend with your name and skips other matches', () => {
    const same = win('d', 'Ethan')
    expect(same.players).toEqual(['Ethan', 'Ethan (online)'])
    const local = newMatch('local', ['Ethan', 'Remo'], { mode: 101, legsToWin: 1, setsToWin: 1, doubleOut: true }, 1)
    if ('error' in local) throw new Error(local.error)
    const stopped = replayOnline(game('e', ['Ethan', 'Remo'], [{ side: 0, score: 60, darts: 3 }], { status: 'stopped' }), 'Ethan')
    const rows = dartsRanking([same, { ...local, winner: 0 }, stopped], 'ethan')
    expect(rows.map((r) => [r.name, r.matches])).toEqual([
      ['ethan', 1],
      ['Ethan', 1],
    ])
  })

  it('is empty without your name or online matches', () => {
    expect(dartsRanking([win('a', 'Remo')], ' ')).toEqual([])
    expect(dartsRanking([], 'Ethan')).toEqual([])
  })
})
