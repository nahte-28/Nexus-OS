import { useSyncExternalStore } from 'react'
import { addToOutbox, isNetworkFailure, outboxDue, outboxFor, parseOutbox, type OutboxItem, type OutboxKind } from '@nexus/core'
import { logEvent } from '../devtools/log'
import { readStorage, writeStorage } from '../state/storage'
import { refreshChannels, registerChannel, reportSync } from './channels'

/**
 * Berichten die wachten op internet. A privébericht or teamchat message written without a
 * connection waits here, on this device only, and goes out in order once NEXUS is online again:
 * on the 'online' event, every minute, and via "Nu syncen" in the Offline-centrum.
 */

const KEY = 'nexus.outbox'
const RETRY_MS = 60_000

export interface OutboxSender {
  /** The signed-in account on this device, or null. */
  owner(): string | null
  /** Resolves to what the server made of it (the message), handed to [onOutboxSent]. */
  send(item: OutboxItem): Promise<unknown>
}

let items: OutboxItem[] = load()
const listeners = new Set<() => void>()
const senders = new Map<OutboxKind, OutboxSender>()
let flushing: Promise<void> | null = null
const sentListeners = new Set<(item: OutboxItem, result: unknown) => void>()

/** A waiting message went out; the open conversation shows it right away. */
export function onOutboxSent(listener: (item: OutboxItem, result: unknown) => void): () => void {
  sentListeners.add(listener)
  return () => sentListeners.delete(listener)
}

function load(): OutboxItem[] {
  try {
    return parseOutbox(JSON.parse(readStorage(KEY) ?? '[]'))
  } catch {
    return []
  }
}

function set(next: OutboxItem[]): void {
  items = next
  writeStorage(KEY, JSON.stringify(items))
  listeners.forEach((l) => l())
  refreshChannels()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The waiting messages of one conversation, live. */
export function useOutbox(kind: OutboxKind, owner: string | undefined, target: string | undefined): OutboxItem[] {
  const all = useSyncExternalStore(subscribe, () => items)
  return owner && target ? outboxFor(all, owner, kind, target) : NONE
}
const NONE: OutboxItem[] = []

export function queueMessage(kind: OutboxKind, owner: string, target: string, text: string, at = Date.now()): OutboxItem {
  const item: OutboxItem = { id: crypto.randomUUID(), kind, owner, target, text, createdAt: at, error: null }
  set(addToOutbox(items, item))
  logEvent('sync', `Bericht wacht op internet (${kind === 'dm' ? 'privébericht' : 'teamchat'})`)
  return item
}

export function cancelQueued(id: string): void {
  set(items.filter((i) => i.id !== id))
}

/** Clears a refusal and tries once more. */
export function retryQueued(id: string): Promise<void> {
  set(items.map((i) => (i.id === id ? { ...i, error: null } : i)))
  return flushOutbox()
}

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false

/**
 * Tries to send now, or queues when there is no connection: resolves to what [send] returned,
 * or to 'queued'. A refusal from the server is thrown, so the person sees why, and nothing waits.
 */
export async function sendOrQueue<T>(kind: OutboxKind, owner: string, target: string, text: string, send: () => Promise<T>): Promise<T | 'queued'> {
  const online = isOnline()
  // Behind older waiting messages of this conversation too, so the order stays as written.
  if (online && !items.some((i) => i.owner === owner && i.kind === kind && i.target === target && i.error === null)) {
    try {
      return await send()
    } catch (err) {
      if (!isNetworkFailure(err, isOnline())) throw err
    }
  }
  queueMessage(kind, owner, target, text)
  if (online) void flushOutbox()
  return 'queued'
}

export function registerOutboxSender(kind: OutboxKind, sender: OutboxSender): () => void {
  senders.set(kind, sender)
  void flushOutbox()
  return () => {
    if (senders.get(kind) === sender) senders.delete(kind)
  }
}

/**
 * Sends what waits, oldest first; stops at the first missing connection. With several tabs
 * open, a Web Lock lets only one of them send, so nothing goes out twice.
 */
export function flushOutbox(): Promise<void> {
  if (flushing) {
    // Something may have changed since this round started (back online, a new sender): once more after it.
    again ??= flushing.then(() => {
      again = null
      return flushOutbox()
    })
    return again
  }
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined
  const round = ((locks ? locks.request('nexus-outbox', () => run()) : run()) as Promise<void>).finally(() => (flushing = null))
  flushing = round
  return round
}
let again: Promise<void> | null = null

async function run(): Promise<void> {
  if (!isOnline()) return
  // Another tab may have sent or added messages meanwhile.
  if (readStorage(KEY) !== null) items = load()
  let sent = 0
  let refused = 0
  for (const kind of ['dm', 'team'] as const) {
    const sender = senders.get(kind)
    const owner = sender?.owner()
    if (!sender || !owner) continue
    for (const item of outboxDue(items, owner).filter((i) => i.kind === kind)) {
      try {
        const result = await sender.send(item)
        set(items.filter((i) => i.id !== item.id))
        sent++
        sentListeners.forEach((l) => l(item, result))
      } catch (err) {
        if (isNetworkFailure(err, isOnline())) {
          if (sent > 0) reportSync('outbox', 'Berichten', 'ok', `${sent} verstuurd`)
          return
        }
        const error = err instanceof Error ? err.message : String(err)
        set(items.map((i) => (i.id === item.id ? { ...i, error } : i)))
        refused++
      }
    }
  }
  if (refused > 0) reportSync('outbox', 'Berichten', 'failed', `${refused} bericht${refused === 1 ? '' : 'en'} niet verstuurd: bekijk ze in het gesprek.`)
  else if (sent > 0) reportSync('outbox', 'Berichten', 'ok', `${sent} wachtend${sent === 1 ? ' bericht' : 'e berichten'} verstuurd`)
}

/** Starts the retries; once, from main.tsx. */
export function startOutbox(): () => void {
  const stopChannel = registerChannel({
    id: 'outbox',
    label: 'Berichten',
    pending: () => items.filter((i) => i.error === null).length,
    syncNow: () => flushOutbox(),
  })
  const onOnline = () => void flushOutbox()
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return
    if (readStorage(KEY) !== null) items = load()
    listeners.forEach((l) => l())
    refreshChannels()
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('storage', onStorage)
  const t = setInterval(() => {
    if (items.length > 0) void flushOutbox()
  }, RETRY_MS)
  return () => {
    stopChannel()
    window.removeEventListener('online', onOnline)
    window.removeEventListener('storage', onStorage)
    clearInterval(t)
  }
}

/** For tests: forget everything. */
export function resetOutbox(): void {
  senders.clear()
  sentListeners.clear()
  set(load())
}
