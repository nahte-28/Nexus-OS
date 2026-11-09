import { useSyncExternalStore } from 'react'
import { addPageVisit, forgetVisit, parseHistory, titleVisit, type Visit } from '@nexus/core'

/**
 * The NEXUS Browser history, on this pc only (localStorage, shared by the toolbar and the main
 * window, which share an origin). Written by the toolbar, shown and cleared in the Browser app.
 */
const KEY = 'nexus.browser.history'
const listeners = new Set<() => void>()
let cache: Visit[] | null = null

function read(): Visit[] {
  if (cache) return cache
  try {
    cache = parseHistory(JSON.parse(localStorage.getItem(KEY) ?? '[]'))
  } catch {
    cache = []
  }
  return cache
}

function write(next: Visit[]): void {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked: history is a convenience, the browser keeps working.
  }
  listeners.forEach((l) => l())
}

export const browserHistory = {
  get: read,
  visit: (url: string, title: string, at = Date.now()) => write(addPageVisit(read(), { url, title, at })),
  title: (url: string, title: string) => {
    const next = titleVisit(read(), url, title)
    if (next !== read()) write(next)
  },
  forget: (visit: Visit) => write(forgetVisit(read(), visit)),
  clear: () => write([]),
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    // The other window (toolbar or main) wrote it.
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY || e.key === null) {
        cache = null
        listener()
      }
    }
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(listener)
      window.removeEventListener('storage', onStorage)
    }
  },
}

export function useBrowserHistory(): Visit[] {
  return useSyncExternalStore(browserHistory.subscribe, browserHistory.get, browserHistory.get)
}
