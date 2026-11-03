import { useSyncExternalStore } from 'react'
import { addRecent, emptyLauncher, parseLauncher, togglePin, type LauncherRef, type LauncherState, type SearchResult } from '@nexus/core'
import { readStorage, writeStorage } from '../state/storage'

const KEY = 'nexus.launcher'

/** Launcher: recent and pinned items, on this device only (they point at your own records). */
class LauncherStore {
  private state: LauncherState
  private listeners = new Set<() => void>()

  constructor() {
    let raw: unknown = null
    try {
      raw = JSON.parse(readStorage(KEY) ?? 'null')
    } catch {
      raw = null
    }
    this.state = parseLauncher(raw) ?? emptyLauncher()
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  getSnapshot = () => this.state

  private set(next: LauncherState) {
    this.state = next
    writeStorage(KEY, JSON.stringify(next))
    this.listeners.forEach((l) => l())
  }

  opened(r: LauncherRef | SearchResult, now = Date.now()) {
    this.set(addRecent(this.state, r, now))
  }

  togglePin(r: LauncherRef | SearchResult) {
    this.set(togglePin(this.state, r))
  }

  clearRecent() {
    this.set({ ...this.state, recent: [] })
  }
}

export const launcherStore = new LauncherStore()
export const useLauncher = () => useSyncExternalStore(launcherStore.subscribe, launcherStore.getSnapshot)
