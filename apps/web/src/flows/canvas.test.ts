import { describe, expect, it } from 'vitest'
import { MAX_ACTIONS, type FlowDefinition } from '@nexus/core'
import { dropBlock, moveItem, parseDragged, removeBlock } from './canvas'

const flow = (): FlowDefinition =>
  ({
    id: 'f1',
    name: 'Test',
    enabled: true,
    version: 1,
    timeZone: 'Europe/Brussels',
  createdAt: 0,
  updatedAt: 0,
    trigger: { type: 'manual' },
    conditions: [],
    actions: [
      { type: 'update.prompt' },
      { type: 'app.open_prompt', app: 'notes' },
    ],
  })

describe('Flow canvas', () => {
  it('moves a block to another place in its lane', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    // Dropped on the block after it: it lands before that block, so where it was.
    const f = flow()
    expect(dropBlock(f, { from: 'canvas', lane: 'actions', index: 0 }, 'actions', 1)!.actions).toEqual(f.actions)
    expect(dropBlock(f, { from: 'canvas', lane: 'actions', index: 0 }, 'actions', 2)!.actions.map((a) => a.type)).toEqual(['app.open_prompt', 'update.prompt'])
  })

  it('adds palette blocks only to their own lane and keeps the limits', () => {
    const f = flow()
    expect(dropBlock(f, { from: 'palette', lane: 'conditions', type: 'network.online' }, 'actions', 0)).toBeNull()
    expect(dropBlock(f, { from: 'palette', lane: 'conditions', type: 'network.online' }, 'conditions', 0)!.conditions).toEqual([{ type: 'network.online' }])
    expect(dropBlock(f, { from: 'palette', lane: 'trigger', type: 'update.available' }, 'trigger', 0)!.trigger).toEqual({ type: 'update.available' })
    const full = { ...f, actions: Array.from({ length: MAX_ACTIONS }, () => ({ type: 'update.prompt' as const })) }
    expect(dropBlock(full, { from: 'palette', lane: 'actions', type: 'update.prompt' }, 'actions', 0)).toBeNull()
  })

  it('keeps at least one action and ignores what it does not know', () => {
    const one = { ...flow(), actions: [{ type: 'update.prompt' as const }] }
    expect(removeBlock(one, 'actions', 0)).toBeNull()
    expect(removeBlock(flow(), 'actions', 0)!.actions).toHaveLength(1)
    expect(parseDragged('gewone tekst')).toBeNull()
    expect(parseDragged(JSON.stringify({ from: 'canvas', lane: 'trigger', index: 0 }))).toBeNull()
    expect(parseDragged(JSON.stringify({ from: 'canvas', lane: 'actions', index: 1 }))).toEqual({ from: 'canvas', lane: 'actions', index: 1 })
  })
})
