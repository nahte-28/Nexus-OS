/** localStorage can throw (private mode, blocked storage); never let that crash the shell. */
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: the app keeps working, it just won't persist.
  }
}
