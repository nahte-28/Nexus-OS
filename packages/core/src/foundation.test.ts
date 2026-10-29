import { describe, expect, it } from 'vitest'
import { dedupeEvents, EVENT_LIMITS, makeEvent, toEvent } from './events'
import { FEATURES, featureOn, parseSwitches } from './features'
import { missingCapabilities, type Capabilities } from './capabilities'

describe('events', () => {
  const event = makeEvent({ id: 'flow:a|e1', source: 'flow', type: 'flow.failed', at: 10, title: 'Flow mislukt', link: { app: 'flows', id: 'a' } })

  it('makes versioned events with a default priority and limits', () => {
    expect(event).toMatchObject({ version: 1, priority: 'normal' })
    expect(makeEvent({ id: 'x', source: 'system', type: 't', at: 1, title: 'a'.repeat(500) }).title).toHaveLength(EVENT_LIMITS.title)
    expect(makeEvent({ id: 'x', source: 'system', type: 'sys.t', at: 1, title: '  ' }).title).toBe('sys.t')
  })

  it('reads stored events back and refuses what it does not understand', () => {
    expect(toEvent(JSON.parse(JSON.stringify(event)))).toEqual(event)
    expect(toEvent({ ...event, source: 'hacker' })).toBeNull()
    expect(toEvent({ ...event, version: 2 })).toBeNull()
    expect(toEvent({ ...event, at: 'nu' })).toBeNull()
    expect(toEvent({ ...event, priority: 'urgent' })?.priority).toBe('normal')
  })

  it('drops retries with the same id', () => {
    const later = { ...event, at: 20, title: 'Opnieuw' }
    const other = { ...event, id: 'b', at: 5 }
    expect(dedupeEvents([event, other, later]).map((e) => [e.id, e.title])).toEqual([
      ['flow:a|e1', 'Opnieuw'],
      ['b', 'Flow mislukt'],
    ])
  })
})

describe('feature flags', () => {
  it('keeps modules that are not built yet off, whatever the switch says', () => {
    for (const f of FEATURES.filter((x) => !x.available)) expect(featureOn({ [f.id]: true }, f.id)).toBe(false)
  })

  it('keeps only known switches', () => {
    expect(parseSwitches({ spaces: true, inbox: 'ja', hack: true })).toEqual({ spaces: true })
    expect(parseSwitches(null)).toEqual({})
  })
})

describe('capabilities', () => {
  it('lists what a device lacks', () => {
    const have = { notifications: true, webPush: false, folderAccess: false, speech: true, clipboardWrite: true, clipboardRead: false, native: false, connect: true } satisfies Capabilities
    expect(missingCapabilities(have, ['notifications', 'native', 'folderAccess'])).toEqual(['native', 'folderAccess'])
    expect(missingCapabilities(have, [])).toEqual([])
  })
})
