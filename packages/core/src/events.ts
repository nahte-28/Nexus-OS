/**
 * NexusEventBus contract (blueprint fase 0): one versioned shape for everything NEXUS reports to
 * itself, so the Inbox, Intelligence and Flow Studio read the same events. Pure logic.
 */
import type { AppId } from './windows'

export const EVENT_VERSION = 1

export type EventSource = 'flow' | 'update' | 'device' | 'deadline' | 'reminder' | 'bridge' | 'suggestion' | 'system' | 'study_group'
export type EventPriority = 'low' | 'normal' | 'high'

export interface NexusEvent {
  /** Idempotency key: the same thing happening twice (a retry, a second tab) has the same id. */
  id: string
  version: number
  source: EventSource
  /** What happened, e.g. 'flow.failed' or 'update.available'. */
  type: string
  at: number
  title: string
  body?: string
  priority: EventPriority
  /** Opens this app (and item) when the event is picked. */
  link?: { app: AppId; id?: string }
  /** Which device it happened on, when it matters. */
  deviceId?: string
}

export type NewEvent = Omit<NexusEvent, 'version' | 'priority'> & { priority?: EventPriority }

const SOURCES: EventSource[] = ['flow', 'update', 'device', 'deadline', 'reminder', 'bridge', 'suggestion', 'system', 'study_group']
const PRIORITIES: EventPriority[] = ['low', 'normal', 'high']

export const EVENT_LIMITS = { id: 200, type: 80, title: 160, body: 1000 }

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

export function makeEvent(input: NewEvent): NexusEvent {
  const L = EVENT_LIMITS
  return {
    ...input,
    id: clip(input.id, L.id),
    version: EVENT_VERSION,
    type: clip(input.type, L.type),
    title: clip(input.title.trim() || input.type, L.title),
    ...(input.body ? { body: clip(input.body, L.body) } : {}),
    priority: input.priority ?? 'normal',
  }
}

/** A stored or received event, or null when it is not one this version understands. */
export function toEvent(value: unknown): NexusEvent | null {
  if (typeof value !== 'object' || value === null) return null
  const e = value as Record<string, unknown>
  if (typeof e.id !== 'string' || !e.id || typeof e.type !== 'string' || typeof e.title !== 'string') return null
  if (typeof e.at !== 'number' || !Number.isFinite(e.at)) return null
  if (!SOURCES.includes(e.source as EventSource)) return null
  if (typeof e.version === 'number' && e.version > EVENT_VERSION) return null
  const link = typeof e.link === 'object' && e.link !== null && typeof (e.link as { app?: unknown }).app === 'string' ? (e.link as NexusEvent['link']) : undefined
  return makeEvent({
    id: e.id,
    source: e.source as EventSource,
    type: e.type,
    at: e.at,
    title: e.title,
    body: typeof e.body === 'string' ? e.body : undefined,
    priority: PRIORITIES.includes(e.priority as EventPriority) ? (e.priority as EventPriority) : 'normal',
    link,
    deviceId: typeof e.deviceId === 'string' ? e.deviceId : undefined,
  })
}

/** Keeps the first of each id, newest first; retries and copies from other tabs fall away. */
export function dedupeEvents(events: NexusEvent[]): NexusEvent[] {
  const seen = new Set<string>()
  return [...events].sort((a, b) => b.at - a.at).filter((e) => !seen.has(e.id) && (seen.add(e.id), true))
}
