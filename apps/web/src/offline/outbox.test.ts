import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutboxItem } from '@nexus/core'
import { cancelQueued, flushOutbox, onOutboxSent, registerOutboxSender, resetOutbox, retryQueued, sendOrQueue } from './outbox'

const waiting = (): OutboxItem[] => JSON.parse(localStorage.getItem('nexus.outbox') ?? '[]') as OutboxItem[]

describe('outbox', () => {
  let online = true
  beforeEach(() => {
    localStorage.clear()
    resetOutbox()
    online = true
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
  })
  afterEach(() => vi.restoreAllMocks())

  it('sends right away when online', async () => {
    const send = vi.fn(async () => ({ id: 'm1' }))
    expect(await sendOrQueue('dm', 'me', 'vriend', 'hoi', send)).toEqual({ id: 'm1' })
    expect(waiting()).toEqual([])
  })

  it('queues offline and sends in order once back online', async () => {
    online = false
    const direct = vi.fn(async () => ({ id: 'x' }))
    expect(await sendOrQueue('dm', 'me', 'vriend', 'een', direct)).toBe('queued')
    expect(await sendOrQueue('dm', 'me', 'vriend', 'twee', direct)).toBe('queued')
    expect(direct).not.toHaveBeenCalled()
    expect(waiting().map((i) => i.text)).toEqual(['een', 'twee'])

    const sent: string[] = []
    const seen: unknown[] = []
    onOutboxSent((_item, result) => seen.push(result))
    registerOutboxSender('dm', { owner: () => 'me', send: async (i) => (sent.push(i.text), { id: i.text }) })
    online = true
    await flushOutbox()
    expect(sent).toEqual(['een', 'twee'])
    expect(seen).toEqual([{ id: 'een' }, { id: 'twee' }])
    expect(waiting()).toEqual([])
  })

  it('queues when the request fails for lack of a connection', async () => {
    const result = await sendOrQueue('team', 'me', 't1', 'hallo', () => Promise.reject(new TypeError('Failed to fetch')))
    expect(result).toBe('queued')
    expect(waiting()).toHaveLength(1)
  })

  it('throws a refusal instead of queueing it', async () => {
    await expect(sendOrQueue('dm', 'me', 'vriend', 'hoi', () => Promise.reject(new Error('Je vriend heeft nog geen toestel met NEXUS')))).rejects.toThrow('toestel')
    expect(waiting()).toEqual([])
  })

  it('keeps a refused waiting message with its reason until Opnieuw', async () => {
    online = false
    await sendOrQueue('dm', 'me', 'vriend', 'hoi', vi.fn())
    let refuse = true
    registerOutboxSender('dm', { owner: () => 'me', send: async () => {
      if (refuse) throw new Error('Geweigerd')
      return { id: 'ok' }
    } })
    online = true
    await flushOutbox()
    expect(waiting()[0].error).toBe('Geweigerd')
    await flushOutbox()
    expect(waiting()).toHaveLength(1)
    refuse = false
    await retryQueued(waiting()[0].id)
    expect(waiting()).toEqual([])
  })

  it('stops at a lost connection, never sends for another account, and can cancel', async () => {
    online = false
    await sendOrQueue('dm', 'ander', 'vriend', 'niet van mij', vi.fn())
    await sendOrQueue('dm', 'me', 'vriend', 'een', vi.fn())
    await sendOrQueue('dm', 'me', 'vriend', 'twee', vi.fn())
    const send = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')))
    registerOutboxSender('dm', { owner: () => 'me', send })
    online = true
    await flushOutbox()
    expect(send).toHaveBeenCalledTimes(1)
    expect(waiting()).toHaveLength(3)
    cancelQueued(waiting().find((i) => i.text === 'een')!.id)
    expect(waiting().map((i) => i.text)).toEqual(['niet van mij', 'twee'])
  })
})
