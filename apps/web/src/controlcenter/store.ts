import { useSyncExternalStore } from 'react'
import { moveFavorite, parseFavorites, toggleFavorite, type AppId } from '@nexus/core'
import { readStorage, writeStorage } from '../state/storage'

const KEY = 'nexus.controlcenter.favorites'
const DEFAULT: AppId[] = ['notes', 'agenda', 'study', 'reminders']

/** Favourite apps in Control Center, per device (like the order of a phone's quick settings). */
class FavoritesStore {
  private list: AppId[]
  private listeners = new Set<() => void>()

  constructor(known: (id: string) => boolean) {
    const raw = readStorage(KEY)
    let parsed: unknown = null
    try {
      parsed = raw ? JSON.parse(raw) : null
    } catch {
      parsed = null
    }
    this.list = parsed === null ? DEFAULT : parseFavorites(parsed, known)
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getSnapshot = () => this.list

  private set(list: AppId[]) {
    this.list = list
    writeStorage(KEY, JSON.stringify(list))
    this.listeners.forEach((l) => l())
  }

  toggle(id: AppId) {
    this.set(toggleFavorite(this.list, id))
  }

  move(id: AppId, by: -1 | 1) {
    this.set(moveFavorite(this.list, id, by))
  }
}

export const favoritesStore = new FavoritesStore((id) => /^[a-z]+$/.test(id))
export const useFavorites = () => useSyncExternalStore(favoritesStore.subscribe, favoritesStore.getSnapshot)
