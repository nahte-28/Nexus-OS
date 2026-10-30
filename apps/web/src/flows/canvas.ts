import {
  defaultAction,
  defaultCondition,
  defaultTrigger,
  MAX_ACTIONS,
  MAX_CONDITIONS,
  type ActionType,
  type ConditionType,
  type FlowDefinition,
  type TriggerType,
} from '@nexus/core'
import { readStorage, writeStorage } from '../state/storage'

/**
 * The Flow Studio canvas: the same flow as the list builder, drawn as blocks. A flow stays one
 * line (Wanneer, then every Alleen als, then each Doe dit in order), so dragging only adds,
 * reorders or removes blocks; it never makes a branch the runner does not know.
 */

export type Lane = 'trigger' | 'conditions' | 'actions'

/** A block being dragged: a new one from the palette, or one already on the canvas. */
export type Dragged = { from: 'palette'; lane: 'trigger'; type: TriggerType } | { from: 'palette'; lane: 'conditions'; type: ConditionType } | { from: 'palette'; lane: 'actions'; type: ActionType } | { from: 'canvas'; lane: 'conditions' | 'actions'; index: number }

export const DRAG_TYPE = 'application/x-nexus-flow-block'

export function parseDragged(raw: string): Dragged | null {
  try {
    const v = JSON.parse(raw) as Partial<Dragged> & { index?: unknown; type?: unknown }
    if (v.from === 'palette' && (v.lane === 'trigger' || v.lane === 'conditions' || v.lane === 'actions') && typeof v.type === 'string') return v as Dragged
    if (v.from === 'canvas' && (v.lane === 'conditions' || v.lane === 'actions') && Number.isInteger(v.index)) return v as Dragged
  } catch {
    // Something else was dropped, e.g. text from another app.
  }
  return null
}

/** [list] with the item at [from] moved to position [to] (counted in the list without it). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return [...list]
  const rest = list.filter((_, i) => i !== from)
  const at = Math.max(0, Math.min(to, rest.length))
  return [...rest.slice(0, at), list[from], ...rest.slice(at)]
}

/**
 * What dropping [d] at position [at] of [lane] does to [flow], or null when it cannot go there:
 * a block in the wrong lane, or a lane that is full. A trigger always replaces the trigger.
 */
export function dropBlock(flow: FlowDefinition, d: Dragged, lane: Lane, at: number): FlowDefinition | null {
  if (d.lane !== lane) return null
  if (d.from === 'canvas') {
    if (d.lane === 'conditions') return { ...flow, conditions: moveItem(flow.conditions, d.index, d.index < at ? at - 1 : at) }
    return { ...flow, actions: moveItem(flow.actions, d.index, d.index < at ? at - 1 : at) }
  }
  if (d.lane === 'trigger') return { ...flow, trigger: defaultTrigger(d.type) }
  if (d.lane === 'conditions') {
    if (flow.conditions.length >= MAX_CONDITIONS) return null
    const conditions = [...flow.conditions]
    conditions.splice(Math.max(0, Math.min(at, conditions.length)), 0, defaultCondition(d.type))
    return { ...flow, conditions }
  }
  if (flow.actions.length >= MAX_ACTIONS) return null
  const actions = [...flow.actions]
  actions.splice(Math.max(0, Math.min(at, actions.length)), 0, defaultAction(d.type))
  return { ...flow, actions }
}

/** Removes a block from the canvas; a flow keeps at least one action. */
export function removeBlock(flow: FlowDefinition, lane: 'conditions' | 'actions', index: number): FlowDefinition | null {
  if (lane === 'conditions') return { ...flow, conditions: flow.conditions.filter((_, i) => i !== index) }
  if (flow.actions.length <= 1) return null
  return { ...flow, actions: flow.actions.filter((_, i) => i !== index) }
}

export type BuilderView = 'list' | 'canvas'
const VIEW_KEY = 'nexus.flows.view'

/** The builder view this device last used. */
export const builderView = (): BuilderView => (readStorage(VIEW_KEY) === 'canvas' ? 'canvas' : 'list')
export const setBuilderView = (view: BuilderView) => writeStorage(VIEW_KEY, view)
