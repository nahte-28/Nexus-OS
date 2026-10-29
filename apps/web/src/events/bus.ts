import { useSyncExternalStore } from 'react'
import { dedupeEvents, makeEvent, toEvent, type NexusEvent, type NewEvent } from '@nexus/core'
import { readStorage, writeStorage } from '../state/storage'

/**
 * NexusEventBus (blueprint fase 0): what happened in NEXUS, in one shape, for the Inbox and
 * Intelligence. Kept on the device (the last 200), shared with other open tabs, and never twice
 * for the same id.
 */
const KEY = 'nexus.events'
const MAX = 200

function load(): NexusEvent[] {
  try {
    const raw: unknown = JSON.parse(readStorage(KEY) ?? '[]')
    return Array.isArray(raw) ? dedupeEvents(raw.map(toEvent).filter((e): e is NexusEvent => e !== null)).slice(0, MAX) : []
  } catch {
    return []
  }
}

export class EventBus {
  private events: NexusEvent[]
  private listeners = new Set<() => void>()
  private channel: BroadcastChannel | null

  constructor(private persist = true) {
    this.events = persist ? load() : []
    this.channel = persist && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('nexus-events') : null
    this.channel?.addEventListener('message', (e: MessageEvent) => {
      const event = toEvent(e.data)
      if (event) this.add(event, false)
    })
  }

  /** Records an event; false when one with that id is already known (a retry or a copy). */
  publish(input: NewEvent): boolean {
    return this.add(makeEvent(input), true)
  }

  private add(event: NexusEvent, broadcast: boolean): boolean {
    if (this.events.some((e) => e.id === event.id)) return false
    this.events = dedupeEvents([event, ...this.events]).slice(0, MAX)
    if (this.persist) writeStorage(KEY, JSON.stringify(this.events))
    if (broadcast) this.channel?.postMessage(event)
    this.listeners.forEach((l) => l())
    return true
  }

  getSnapshot = (): NexusEvent[] => this.events

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const eventBus = new EventBus(typeof window !== 'undefined')

export function useEvents(bus: EventBus = eventBus): NexusEvent[] {
  return useSyncExternalStore(bus.subscribe, bus.getSnapshot)
}
