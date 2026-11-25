import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, type AppId, type Rect, type WindowsState } from './windows'

/**
 * The open windows of the desktop, saved on this device so they come back after a reload or a
 * restart of the Windows app: which apps, where, and whether minimized or maximized. Pure logic;
 * the web app stores it in localStorage.
 */

export const WINDOW_SESSION_VERSION = 1
/** More than this is never a session someone wants back; it also bounds what a start restores. */
export const MAX_SESSION_WINDOWS = 12

export interface SavedWindow {
  appId: AppId
  rect: Rect
  minimized: boolean
  maximized: boolean
  /** How far to the front: 0 is at the back, the highest was in front. */
  layer: number
}

export interface WindowSession {
  v: typeof WINDOW_SESSION_VERSION
  /** In taskbar order (the order they were opened). */
  windows: SavedWindow[]
}

/** What to save of the current windows: taskbar order, and which was in front of which. */
export function saveWindowSession(state: WindowsState): WindowSession {
  const kept = state.windows.slice(-MAX_SESSION_WINDOWS)
  const byZ = [...kept].sort((a, b) => a.z - b.z).map((w) => w.id)
  const windows = kept.map((w) => ({ appId: w.appId, rect: { ...w.rect }, minimized: w.minimized, maximized: w.maximized, layer: byZ.indexOf(w.id) }))
  return { v: WINDOW_SESSION_VERSION, windows }
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** Keeps a saved window on a screen that may be smaller now: its title bar stays reachable. */
export function fitRect(rect: Rect, area: { width: number; height: number }): Rect {
  const width = Math.round(Math.min(Math.max(rect.width, MIN_WINDOW_WIDTH), Math.max(area.width, MIN_WINDOW_WIDTH)))
  const height = Math.round(Math.min(Math.max(rect.height, MIN_WINDOW_HEIGHT), Math.max(area.height, MIN_WINDOW_HEIGHT)))
  const x = Math.round(Math.min(Math.max(rect.x, 0), Math.max(area.width - width, 0)))
  const y = Math.round(Math.min(Math.max(rect.y, 0), Math.max(area.height - 40, 0)))
  return { x, y, width, height }
}

/**
 * The saved windows that can come back: only apps that exist and are switched on ([isAvailable]),
 * each app once (apps are single-instance), placed inside [area]. Anything unreadable gives none.
 */
export function parseWindowSession(raw: unknown, area: { width: number; height: number }, isAvailable: (id: string) => boolean): SavedWindow[] {
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== WINDOW_SESSION_VERSION) return []
  const list = (raw as { windows?: unknown }).windows
  if (!Array.isArray(list)) return []
  const out: SavedWindow[] = []
  const seen = new Set<string>()
  for (const item of list.slice(-MAX_SESSION_WINDOWS)) {
    if (!item || typeof item !== 'object') continue
    const w = item as Record<string, unknown>
    const r = w.rect as Record<string, unknown> | undefined
    if (typeof w.appId !== 'string' || !isAvailable(w.appId) || !r || ![r.x, r.y, r.width, r.height].every(isNum)) continue
    // Single-instance: a later copy wins.
    if (seen.has(w.appId)) out.splice(out.findIndex((o) => o.appId === w.appId), 1)
    seen.add(w.appId)
    out.push({
      appId: w.appId as AppId,
      rect: fitRect({ x: r.x as number, y: r.y as number, width: r.width as number, height: r.height as number }, area),
      minimized: w.minimized === true,
      maximized: w.maximized === true,
      layer: isNum(w.layer) ? w.layer : out.length,
    })
  }
  // Layers as 0..n-1 in the same order, also after dropping windows.
  const rank = [...out].sort((a, b) => a.layer - b.layer)
  return out.map((w) => ({ ...w, layer: rank.indexOf(w) }))
}
