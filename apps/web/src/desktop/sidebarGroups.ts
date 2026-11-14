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
