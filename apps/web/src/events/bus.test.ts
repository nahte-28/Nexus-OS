import { describe, expect, it } from 'vitest'
import { EventBus } from './bus'

describe('EventBus', () => {
  it('keeps one event per id and tells listeners', () => {
    const bus = new EventBus(false)
    let calls = 0
    bus.subscribe(() => calls++)
    expect(bus.publish({ id: 'update:1.0.5', source: 'update', type: 'update.available', at: 1, title: 'Versie 1.0.5' })).toBe(true)
    expect(bus.publish({ id: 'update:1.0.5', source: 'update', type: 'update.available', at: 2, title: 'Versie 1.0.5' })).toBe(false)
    expect(bus.getSnapshot()).toHaveLength(1)
    expect(calls).toBe(1)
  })
})
