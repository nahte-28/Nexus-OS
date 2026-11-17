import { describe, expect, it } from 'vitest'
import { buildDuel, duelLine, duelToPlay, duelWinner, parseDuels, type CardDuel } from './cardDuel'
import { newCard } from './flashcards'

const cards = ['een', 'twee', 'drie', 'vier', 'vijf'].map((w, i) => newCard(`c${i}`, 'd1', `Vraag ${w}`, `Antwoord ${w}`, 0))

const duel = (patch: Partial<CardDuel> = {}): CardDuel => ({
  id: 'u1', side: 0, otherName: 'Remo', deckName: 'Elektronica', questions: [{ front: 'Wet van Ohm', options: ['U=RI', 'P=UI', 'Q=It', 'F=ma'] }, { front: 'Eenheid van R', options: ['V', 'A', 'Ω', 'W'] }],
  status: 'open', myPicks: null, myScore: null, myMs: null, answers: null, theirScore: null, theirMs: null, theirPlayed: false, createdAt: 1, updatedAt: 2, ...patch,
})

describe('cardDuel', () => {
  it('makes multiple choice with the right answer among four', () => {
    let seed = 1
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const built = buildDuel(cards, random, 10)
    if ('error' in built) throw new Error(built.error)
    expect(built.questions).toHaveLength(5)
    built.questions.forEach((q, i) => {
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options).size).toBe(4)
      expect(q.options[built.answers[i]]).toBe(q.front.replace('Vraag', 'Antwoord'))
    })
    expect(buildDuel(cards.slice(0, 3))).toEqual({ error: 'Een duel vraagt minstens 4 kaarten met een verschillend antwoord.' })
    // Cards with the same answer count once.
    expect('error' in buildDuel([...cards.slice(0, 3), { ...cards[3], back: 'Antwoord een' }])).toBe(true)
  })

  it('says what to do and who won', () => {
    expect(duelToPlay(duel())).toBe(true)
    expect(duelLine(duel({ side: 1 }))).toBe('Remo daagt je uit: 2 vragen.')
    expect(duelLine(duel({ myPicks: [0, 2], myScore: 2, myMs: 9400 }))).toBe('Jij: 2 van 2 in 9 s. Wacht op Remo.')
    const both = duel({ status: 'done', myPicks: [0, 1], myScore: 1, myMs: 5000, answers: [0, 2], theirPlayed: true, theirScore: 1, theirMs: 8000 })
    expect(duelWinner(both)).toBe('me')
    expect(duelLine(both)).toBe('Je won van Remo, 1–1.')
    expect(duelLine({ ...both, theirScore: 2 })).toBe('Remo won, 1–2.')
    expect(duelLine({ ...both, theirMs: 5000 })).toBe('Gelijkspel, 1–1.')
    expect(duelLine(duel({ status: 'declined' }))).toBe('Remo sloeg je duel af.')
  })

  it('reads the list safely', () => {
    const list = parseDuels([{ ...duel(), myPicks: [0, 9], answers: [0, 2], createdAt: '2026-11-17T08:00:00Z' }, { id: 'x', side: 0, otherName: 'A', status: 'open', questions: [] }, null])
    expect(list).toHaveLength(1)
    expect(list[0].myPicks).toBeNull()
    expect(list[0].answers).toEqual([0, 2])
    expect(list[0].createdAt).toBe(Date.parse('2026-11-17T08:00:00Z'))
  })
})
