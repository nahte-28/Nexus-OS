import { useSyncExternalStore } from 'react'
import type { AppId } from '@nexus/core'
import { readStorage, writeStorage } from '../state/storage'

const KEY = 'nexus.apps.usage'

/** Hoe vaak je elke app opende, op dit apparaat. Voor "Meest gebruikt" op het bureaublad. */
class UsageStore {
  private counts: Record<string, number>
  private listeners = new Set<() => void>()

  constructor() {
    let parsed: unknown = null
    try {
      parsed = JSON.parse(readStorage(KEY) ?? 'null')
    } catch {
      parsed = null
    }
    this.counts = {}
    if (parsed && typeof parsed === 'object') {
      for (const [id, n] of Object.entries(parsed as Record<string, unknown>)) {
        if (/^[a-z]+$/.test(id) && typeof n === 'number' && Number.isFinite(n) && n > 0) this.counts[id] = Math.floor(n)
      }
    }
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getSnapshot = () => this.counts

  record(id: AppId) {
    this.counts = { ...this.counts, [id]: (this.counts[id] ?? 0) + 1 }
    writeStorage(KEY, JSON.stringify(this.counts))
    this.listeners.forEach((l) => l())
  }
}

export const usageStore = new UsageStore()
export const useUsage = () => useSyncExternalStore(usageStore.subscribe, usageStore.getSnapshot)

/** De apps die je het vaakst opent, meest gebruikt eerst; bij gelijke stand de volgorde van `among`. */
export function mostUsed<T extends { id: AppId }>(counts: Record<string, number>, among: T[], limit: number): T[] {
  return among
    .map((app, i) => ({ app, i, n: counts[app.id] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.app)
}
