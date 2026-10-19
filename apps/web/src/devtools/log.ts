import { useSyncExternalStore } from 'react'
import { readStorage, writeStorage } from '../state/storage'

/** Where an event came from, for filtering in the Developer app. */
export type LogSource = 'ai' | 'reminders' | 'connect' | 'sync' | 'system'

export interface LogEntry {
  id: number
  at: number
  source: LogSource
  message: string
  error?: boolean
}

const MAX_ENTRIES = 300
let entries: LogEntry[] = []
let nextId = 1
const listeners = new Set<() => void>()

/** Records what NEXUS did, never the content of notes, messages or AI conversations. */
export function logEvent(source: LogSource, message: string, error = false): void {
  entries = [{ id: nextId++, at: Date.now(), source, message, error }, ...entries].slice(0, MAX_ENTRIES)
  listeners.forEach((l) => l())
}

export function clearLog(): void {
  entries = []
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLog(): LogEntry[] {
  return useSyncExternalStore(subscribe, () => entries)
}

const DEV_MODE_KEY = 'nexus.developer'
let devMode = readStorage(DEV_MODE_KEY) === 'on'
const devListeners = new Set<() => void>()

export function setDeveloperMode(on: boolean): void {
  devMode = on
  writeStorage(DEV_MODE_KEY, on ? 'on' : 'off')
  devListeners.forEach((l) => l())
}

/** Developer mode shows the Developer app with the event log and system details. */
export function useDeveloperMode(): boolean {
  return useSyncExternalStore(
    (l) => {
      devListeners.add(l)
      return () => devListeners.delete(l)
    },
    () => devMode,
  )
}
