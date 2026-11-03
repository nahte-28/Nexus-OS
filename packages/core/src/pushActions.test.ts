import { describe, expect, it } from 'vitest'
import { actionTokenHash, newActionToken, pushActionsFor } from './pushActions'

describe('pushActions', () => {
  it('gives a deadline Klaar and Later, other reminders only Later, live messages nothing', () => {
    expect(pushActionsFor('deadline:0b6e3f2a-1c2d-4e5f-8a9b-0c1d2e3f4a5b@100-60')).toEqual(['done', 'later'])
    expect(pushActionsFor('deadline:0b6e3f2a-1c2d-4e5f-8a9b-0c1d2e3f4a5b@100-60~later5')).toEqual(['done', 'later'])
    expect(pushActionsFor('appointment:a@1-15')).toEqual(['later'])
    expect(pushActionsFor('reminder:r@5')).toEqual(['later'])
    expect(pushActionsFor('live:123')).toEqual([])
    expect(pushActionsFor('dagstart:2026-11-03')).toEqual([])
  })

  it('makes random tokens and hashes them as the database does', async () => {
    const a = newActionToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(newActionToken()).not.toBe(a)
    expect(await actionTokenHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
