import type { AppId } from './windows'

/** How many apps the Start menu remembers under "Recent". */
export const MAX_RECENT_APPS = 8

/** The app you just opened goes first; an older entry of the same app drops out. */
export function pushRecentApp(recent: readonly AppId[], id: AppId, limit = MAX_RECENT_APPS): AppId[] {
  return [id, ...recent.filter((x) => x !== id)].slice(0, limit)
}

/** Reads what was stored, keeping only well-formed app ids, without duplicates, newest first. */
export function parseRecentApps(value: unknown, limit = MAX_RECENT_APPS): AppId[] {
  if (!Array.isArray(value)) return []
  const out: AppId[] = []
  for (const x of value) {
    if (typeof x === 'string' && /^[a-z]+$/.test(x) && !out.includes(x as AppId)) out.push(x as AppId)
  }
  return out.slice(0, limit)
}
