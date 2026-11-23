import { useSyncExternalStore } from 'react'
import type { AppGroupId } from '@nexus/core'
import { readStorage, writeStorage } from '../state/storage'

const KEY = 'nexus.sidebar.folded'
const read = (): AppGroupId[] => {
  try {
    const v = JSON.parse(readStorage(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is AppGroupId => typeof x === 'string') : []
  } catch {
    return []
  }
}
let folded = read()
const listeners = new Set<() => void>()

/** Folds a group of the sidebar away or opens it again; remembered on this device. */
export function toggleGroup(id: AppGroupId): void {
  folded = folded.includes(id) ? folded.filter((g) => g !== id) : [...folded, id]
  writeStorage(KEY, JSON.stringify(folded))
  listeners.forEach((l) => l())
}

export function useFoldedGroups(): AppGroupId[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => folded,
  )
}

const COLLAPSED_KEY = 'nexus.sidebar.collapsed'
let collapsed = readStorage(COLLAPSED_KEY) === '1'
const collapseListeners = new Set<() => void>()

/** Folds the whole sidebar to a narrow strip of icons (or opens it again), for more room; remembered on this device. */
export function toggleSidebar(): void {
  collapsed = !collapsed
  writeStorage(COLLAPSED_KEY, collapsed ? '1' : '0')
  collapseListeners.forEach((l) => l())
}

export const isSidebarCollapsed = (): boolean => collapsed

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(
    (l) => {
      collapseListeners.add(l)
      return () => collapseListeners.delete(l)
    },
    () => collapsed,
  )
}
