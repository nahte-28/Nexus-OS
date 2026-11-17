import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CardDuel, DuelQuestion } from '@nexus/core'
import { addCards, addDeck } from './store'
import { setDuelsApi, syncDuels } from './duel'
import { ChallengeFriend, DuelPlay, DuelsSection } from './Duels'

/** A fake database: keeps the answers and counts the score like card_duel_play. */
function fakeApi() {
  const duels: CardDuel[] = []
  const answers = new Map<string, number[]>()
  return {
    duels,
    list: vi.fn(async () => duels.map((d) => ({ ...d }))),
    create: vi.fn(async (_friend: string, deckName: string, questions: DuelQuestion[], right: number[]) => {
      const id = `d${duels.length + 1}`
      answers.set(id, right)
      duels.push({ id, side: 0, otherName: 'Remo', deckName, questions, status: 'open', myPicks: null, myScore: null, myMs: null, answers: null, theirScore: null, theirMs: null, theirPlayed: false, createdAt: Date.now(), updatedAt: Date.now() })
      return id
    }),
    play: vi.fn(async (id: string, picks: number[], ms: number) => {
      const d = duels.find((x) => x.id === id)!
      const right = answers.get(id)!
      const score = picks.filter((p, i) => p === right[i]).length
      Object.assign(d, { myPicks: picks, myScore: score, myMs: ms, answers: right })
      return score
    }),
    decline: vi.fn(async () => {}),
  }
}

describe('Leerkaarten-duel', () => {
  afterEach(() => {
    cleanup()
    setDuelsApi(null)
  })

  it('challenges a friend with a deck, plays it and shows the right answers', async () => {
    const deck = addDeck('Elektronica')
    addCards(deck, ['Ohm', 'Volt', 'Ampère', 'Watt', 'Farad'].map((w) => ({ front: `Eenheid ${w}`, back: w })))
    const api = fakeApi()
    setDuelsApi(api, [])
    let playing = ''
    const friends = { list: vi.fn(async () => [{ userId: 'u2', displayName: 'Remo', kind: 'friend' as const, since: 0 }]) }
    render(<ChallengeFriend deckId={deck} onPlay={(id) => (playing = id)} friendsApi={friends} />)
    fireEvent.click(screen.getByText('Daag een vriend uit'))
    fireEvent.click(await screen.findByRole('radio', { name: 'Remo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Uitdagen en zelf spelen' }))
    await waitFor(() => expect(playing).toBe('d1'))
    const [, deckName, questions] = api.create.mock.calls[0]
    expect(deckName).toBe('Elektronica')
    expect(questions).toHaveLength(5)
    cleanup()

    render(<DuelPlay id="d1" onDone={() => {}} />)
    for (let i = 0; i < 5; i++) {
      const front = screen.getByText(/^Eenheid /).textContent!.replace('Eenheid ', '')
      fireEvent.click(screen.getByRole('button', { name: front }))
    }
    expect(await screen.findByText('Jij: 5 van 5 in 0 s. Wacht op Remo.')).toBeTruthy()
    expect(screen.getAllByText(/^Juist: /)).toHaveLength(5)
  })

  it('lists a challenge to play first and notifies once', async () => {
    const api = fakeApi()
    api.duels.push({ id: 'x1', side: 1, otherName: 'Lotte', deckName: 'Wiskunde', questions: [{ front: 'π', options: ['3,14', '2,71', '1,41', '1,61'] }], status: 'open', myPicks: null, myScore: null, myMs: null, answers: null, theirScore: null, theirMs: null, theirPlayed: true, createdAt: 1, updatedAt: 1 })
    setDuelsApi(api, null)
    await syncDuels(api, true)
    const onPlay = vi.fn()
    render(<DuelsSection onPlay={onPlay} />)
    expect(screen.getByText('Lotte daagt je uit: 1 vraag.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Duel tegen Lotte spelen' }))
    expect(onPlay).toHaveBeenCalledWith('x1')
    fireEvent.click(screen.getByRole('button', { name: 'Duel van Lotte afslaan' }))
    await waitFor(() => expect(api.decline).toHaveBeenCalledWith('x1'))
  })
})
