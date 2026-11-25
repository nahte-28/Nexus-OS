import { reportWriteFailure } from './storageHealth'

/** localStorage can throw (private mode, blocked storage); never let that crash the shell. */
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Saves on this device; false when it did not work. Blocked storage (private mode) stays quiet,
 * the app keeps working without persisting; full storage is reported, so the shell can say so.
 */
export function writeStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (err) {
    reportWriteFailure(err, key)
    return false
  }
}
