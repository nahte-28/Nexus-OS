import { useSyncExternalStore } from 'react'
import { logEvent } from '../devtools/log'
import { isDesktopApp } from './desktop'

export interface UpdateInfo {
  version: string
  url: string
}

export type UpdateState =
  | { status: 'idle' | 'checking' | 'current' }
  | { status: 'available' | 'installing'; update: UpdateInfo }
  | { status: 'error'; error: string }

const CHECK_EVERY_MS = 6 * 60 * 60_000

let state: UpdateState = { status: 'idle' }
const listeners = new Set<() => void>()

function set(next: UpdateState): void {
  state = next
  listeners.forEach((l) => l())
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

/** Asks the Windows app whether a newer installer was published. Only does something in the app. */
export async function checkForUpdate(): Promise<void> {
  if (!isDesktopApp || state.status === 'checking' || state.status === 'installing') return
  set({ status: 'checking' })
  try {
    const update = await invoke<UpdateInfo | null>('check_update')
    set(update ? { status: 'available', update } : { status: 'current' })
    if (update) logEvent('system', `Update beschikbaar: ${update.version}`)
  } catch (err) {
    set({ status: 'error', error: String(err) })
  }
}

/** Downloads and starts the installer; NEXUS closes and comes back on the new version. */
export async function installUpdate(): Promise<void> {
  if (state.status !== 'available') return
  const { update } = state
  set({ status: 'installing', update })
  try {
    await invoke('install_update', { url: update.url })
  } catch (err) {
    set({ status: 'error', error: String(err) })
  }
}

/** Checks at start and every few hours while the Windows app runs. */
export function startUpdateChecks(): () => void {
  if (!isDesktopApp) return () => {}
  void checkForUpdate()
  const timer = setInterval(() => void checkForUpdate(), CHECK_EVERY_MS)
  return () => clearInterval(timer)
}

export function useUpdate(): UpdateState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
