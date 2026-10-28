import { describe, expect, it } from 'vitest'
import { deckStats, dueCards, intervalLabel, mergeFlashcards, newCard, parseAiCards, parseFlashcardsState, reviewCard, type FlashcardsState } from './flashcards'

const now = new Date(2026, 9, 27, 15, 0).getTime()
const day = (n: number) => new Date(2026, 9, 27 + n).getTime()
const deck = { id: 'd', name: 'Elektronica', createdAt: 0, updatedAt: 1, deletedAt: null }

describe('Leerkaarten', () => {
  it('schedules a card further out each time it is known', () => {
    let card = newCard('c', 'd', 'Wet van Ohm?', 'U = R · I', now)
    card = reviewCard(card, 'good', now)
    expect(card).toMatchObject({ interval: 1, reps: 1, due: day(1) })
    card = reviewCard(card, 'good', day(1) + 3_600_000)
    expect(card).toMatchObject({ interval: 3, reps: 2, due: day(4) })
    card = reviewCard(card, 'good', day(4) + 3_600_000)
    expect(card.interval).toBe(8)
    card = reviewCard(card, 'again', day(12))
    expect(card).toMatchObject({ interval: 0, reps: 0, lapses: 1, due: day(12) + 10 * 60_000 })
    expect(card.ease).toBeCloseTo(2.3)
    expect(reviewCard(newCard('n', 'd', 'a', 'b', now), 'easy', now).interval).toBe(4)
  })

  it('counts what is due per deck, without deleted cards or decks', () => {
    const state: FlashcardsState = {
      decks: [deck, { ...deck, id: 'weg', deletedAt: 5 }],
      cards: [newCard('a', 'd', 'v', 'a', now), { ...newCard('b', 'd', 'v', 'a', now), due: day(3), reps: 2, interval: 30 }, { ...newCard('c', 'd', 'v', 'a', now), deletedAt: 9 }, newCard('x', 'weg', 'v', 'a', now)],
      revision: 1,
    }
    expect(dueCards(state, now).map((c) => c.id)).toEqual(['a'])
    expect(deckStats(state, 'd', now)).toEqual({ total: 2, due: 1, fresh: 1, learned: 1 })
  })

  it('merges card by card and survives bad data', () => {
    const a: FlashcardsState = { decks: [deck], cards: [{ ...newCard('c', 'd', 'oud', 'x', now), updatedAt: 1 }], revision: 2 }
    const b: FlashcardsState = { decks: [], cards: [{ ...newCard('c', 'd', 'nieuw', 'x', now), updatedAt: 2 }, newCard('e', 'd', 'ander', 'y', now)], revision: 5 }
    const m = mergeFlashcards(a, b)
    expect(m.cards.map((c) => c.front).sort()).toEqual(['ander', 'nieuw'])
    expect(m.revision).toBe(5)
    expect(parseFlashcardsState({ decks: [{ id: 1 }], cards: 'x' })).toEqual({ decks: [], cards: [], revision: 0 })
  })

  it('reads the cards NEXUS AI wrote', () => {
    const text = 'Hier zijn je kaarten:\n\nV: Wat is de eenheid van weerstand?\nA: Ohm (Ω)\n\n**V:** Formule voor vermogen?\n**A:** P = U · I\nof P = I² · R\n\nV: Zonder antwoord\n'
    expect(parseAiCards(text)).toEqual([
      { front: 'Wat is de eenheid van weerstand?', back: 'Ohm (Ω)' },
      { front: 'Formule voor vermogen?', back: 'P = U · I\nof P = I² · R' },
    ])
  })

  it('labels the intervals in Dutch', () => {
    expect([0, 1, 3, 60, 400].map(intervalLabel)).toEqual(['10 min', '1 dag', '3 dagen', '2 mnd', '1,1 jaar'])
  })
})
