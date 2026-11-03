import { useSyncExternalStore } from 'react'
import { addSyncRun, parseSyncRuns, type ChannelStatus, type SyncOutcome, type SyncRun } from '@nexus/core'
import { readStorage, writeStorage } from '../state/storage'

/**
 * Everything that syncs registers here: the Offline-centrum shows what waits, what failed and the
 * history, and "Nu syncen" runs every channel at once. Registering costs nothing when the module
 * is off: a sync that never starts never registers.
 */
export interface SyncChannel {
  id: string
  label: string
  /** Changes on this device the account does not have yet. */
  pending(): number
  syncNow(): Promise<void>
}

const HISTORY_KEY = 'nexus.offline.history'
const channels = new Map<string, SyncChannel>()
const status = new Map<string, { lastOkAt: number | null; error: string | null }>()
const listeners = new Set<() => void>()
let runs: SyncRun[] = (() => {
  try {
    return parseSyncRuns(JSON.parse(readStorage(HISTORY_KEY) ?? '[]'))
  } catch {
    return []
  }
})()
let snapshot: { channels: ChannelStatus[]; runs: SyncRun[] } = { channels: [], runs }

function emit(): void {
  snapshot = {
    channels: [...channels.values()].map((c) => ({ id: c.id, label: c.label, pending: safePending(c), lastOkAt: status.get(c.id)?.lastOkAt ?? null, error: status.get(c.id)?.error ?? null })).sort((a, b) => a.label.localeCompare(b.label, 'nl')),
    runs,
  }
  listeners.forEach((l) => l())
}

function safePending(c: SyncChannel): number {
  try {
    return Math.max(0, c.pending())
  } catch {
    return 0
  }
}

export function registerChannel(channel: SyncChannel): () => void {
  channels.set(channel.id, channel)
  emit()
  return () => {
    if (channels.get(channel.id) === channel) channels.delete(channel.id)
    emit()
  }
}

/**
 * A sync round finished. Only rounds that changed something, failed or merged go in the
 * history; an ordinary poll with nothing new only updates "laatst gesynchroniseerd".
 */
export function reportSync(id: string, label: string, outcome: SyncOutcome, detail = '', at = Date.now(), quiet = false): void {
  const s = status.get(id) ?? { lastOkAt: null, error: null }
  status.set(id, outcome === 'failed' ? { ...s, error: detail || 'Mislukt' } : { lastOkAt: at, error: null })
  if (!quiet || outcome !== 'ok') {
    const next = addSyncRun(runs, { id: `${id}:${at}:${Math.random().toString(36).slice(2, 6)}`, at, channel: id, label, outcome, detail })
    if (next !== runs) {
      runs = next
      writeStorage(HISTORY_KEY, JSON.stringify(runs))
    }
  }
  emit()
}

/** A channel's pending count changed (a local edit). */
export const refreshChannels = () => emit()

/** Runs every registered sync now; resolves when all are done (failures are reported, not thrown). */
export async function syncAll(): Promise<void> {
  await Promise.all([...channels.values()].map((c) => c.syncNow().catch(() => {})))
  emit()
}

export function clearHistory(): void {
  runs = []
  writeStorage(HISTORY_KEY, '[]')
  emit()
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const getOffline = () => snapshot
export const useOffline = () => useSyncExternalStore(subscribe, getOffline)
