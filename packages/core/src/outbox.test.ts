import { describe, expect, it } from 'vitest'
import { addToOutbox, isNetworkFailure, OUTBOX_MAX, outboxDue, outboxFor, parseOutbox, type OutboxItem } from './outbox'

const item = (id: string, at: number, extra: Partial<OutboxItem> = {}): OutboxItem => ({ id, kind: 'dm', owner: 'me', target: 'vriend', text: `bericht ${id}`, createdAt: at, error: null, ...extra })

describe('outbox', () => {
  it('parses stored items in time order and drops broken ones', () => {
    expect(parseOutbox([item('b', 2), { id: 'x' }, item('a', 1), null]).map((i) => i.id)).toEqual(['a', 'b'])
    expect(parseOutbox('rommel')).toEqual([])
  })

  it('keeps at most the newest OUTBOX_MAX', () => {
    let list: OutboxItem[] = []
    for (let i = 0; i < OUTBOX_MAX + 5; i++) list = addToOutbox(list, item(`m${i}`, i))
    expect(list).toHaveLength(OUTBOX_MAX)
    expect(list[0].id).toBe('m5')
  })

  it('picks one conversation and what is due for this account', () => {
    const list = [item('a', 1), item('b', 2, { kind: 'team', target: 't1' }), item('c', 3, { owner: 'ander' }), item('d', 4, { error: 'Geweigerd' })]
    expect(outboxFor(list, 'me', 'dm', 'vriend').map((i) => i.id)).toEqual(['a', 'd'])
    expect(outboxDue(list, 'me').map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('tells a missing connection from a refusal', () => {
    expect(isNetworkFailure(new Error('anything'), false)).toBe(true)
    expect(isNetworkFailure(new TypeError('Failed to fetch'), true)).toBe(true)
    expect(isNetworkFailure({ message: 'TypeError: Load failed' }, true)).toBe(true)
    expect(isNetworkFailure(new Error('Geen verbinding met de server.'), true)).toBe(true)
    expect(isNetworkFailure(new Error('Je vriend heeft nog geen toestel met NEXUS'), true)).toBe(false)
  })
})
