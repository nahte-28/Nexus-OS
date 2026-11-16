import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { OnlineGame } from '@nexus/core'
import { Online } from './Online'
import type { DartsOnline } from './online'
import { dartsStore } from './store'

const game = (patch: Partial<OnlineGame> = {}): OnlineGame => ({ id: 'g1', side: 1, players: ['Remo', 'Ethan'], mode: 101, legsToWin: 1, setsToWin: 1, doubleOut: true, status: 'invited', visits: [], createdAt: 1, updatedAt: 2, ...patch })

function fake(games: OnlineGame[]) {
  let list = games
  const api = {
    signedIn: vi.fn(async () => true),
    list: vi.fn(async () => list),
    invite: vi.fn(async () => 'new'),
    answer: vi.fn(async (_id: string, accept: boolean) => {
      list = list.map((g) => ({ ...g, status: accept ? 'playing' : 'declined' }))
    }),
    throwVisit: vi.fn(async (_id: string, _seq: number, score: number, darts: number) => {
      list = list.map((g) => ({ ...g, visits: [...g.visits, { side: g.side, score, darts }], updatedAt: g.updatedAt + 1 }))
    }),
    undo: vi.fn(async () => {}),
    end: vi.fn(async (_id: string, status: 'done' | 'stopped') => {
      list = list.map((g) => ({ ...g, status }))
    }),
    watch: vi.fn(() => () => {}),
  }
  return { api, friends: { list: vi.fn(async () => [{ userId: 'u2', displayName: 'Remo', kind: 'friend' as const, since: 1 }]) } }
}

describe('Darts online', () => {
  afterEach(cleanup)

  it('challenges a friend', async () => {
    const { api, friends } = fake([])
    render(<Online apis={{ online: api as unknown as DartsOnline, friends }} />)
    const form = await screen.findByRole('form', { name: 'Vriend uitdagen' })
    fireEvent.click(within(form).getByRole('button', { name: 'Uitdagen' }))
    await waitFor(() => expect(api.invite).toHaveBeenCalledWith('u2', { mode: 501, legsToWin: 2, setsToWin: 1, doubleOut: true }))
  })

  it('accepts, throws in turn and saves the won match in the history', async () => {
    // Remo opened with 60; Ethan (you) is the guest.
    const { api, friends } = fake([game({ visits: [{ side: 0, score: 60, darts: 3 }] })])
    render(<Online apis={{ online: api as unknown as DartsOnline, friends }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Aanvaarden' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Gooien' }))
    const board = screen.getByRole('region', { name: 'Online match' })
    expect(within(board).getByText('Jij gooit, nog 101.')).toBeTruthy()
    fireEvent.change(within(board).getByRole('spinbutton', { name: 'Score van je beurt' }), { target: { value: '101' } })
    fireEvent.change(within(board).getByRole('combobox', { name: 'Pijlen voor de finish' }), { target: { value: '2' } })
    fireEvent.click(within(board).getByRole('button', { name: 'Invoeren' }))
    await waitFor(() => expect(api.throwVisit).toHaveBeenCalledWith('g1', 1, 101, 2))
    await waitFor(() => expect(api.end).toHaveBeenCalledWith('g1', 'done'))
    await waitFor(() => expect(dartsStore.getSnapshot().matches.find((m) => m.id === 'online-g1')?.winner).toBe(1))
    expect(dartsStore.getSnapshot().matches.find((m) => m.id === 'online-g1')?.players[1]).toBe(dartsStore.getSnapshot().settings.me)
  })
})
