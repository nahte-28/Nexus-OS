/** Pure window-manager state, shared by every runtime (web, Tauri). */

export type AppId = 'notes' | 'notifications' | 'devices' | 'assistant' | 'reminders' | 'account' | 'settings' | 'developer' | 'profiles' | 'klashub' | 'flows' | 'agenda' | 'files' | 'study' | 'grades' | 'habits' | 'flashcards' | 'insights' | 'finance' | 'journal' | 'about' | 'help' | 'spaces' | 'inbox' | 'timemachine' | 'bridge' | 'intelligence' | 'devhub' | 'capture' | 'briefing' | 'projecthub' | 'knowledge' | 'studylab' | 'gaming' | 'teams' | 'controlcenter' | 'sentinel' | 'offline' | 'marketplace' | 'darts' | 'goals' | 'clock' | 'calculator' | 'weather' | 'contacts' | 'browser' | 'linuxapps' | 'system' | 'friends' | 'admin'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowState {
  id: string
  appId: AppId
  title: string
  rect: Rect
  z: number
  minimized: boolean
  maximized: boolean
}

export interface WindowsState {
  windows: WindowState[]
  focusedId: string | null
  nextZ: number
  nextId: number
}

export type WindowAction =
  | { type: 'open'; appId: AppId; title: string; rect: Rect }
  | { type: 'close'; id: string }
  | { type: 'focus'; id: string }
  | { type: 'minimize'; id: string }
  | { type: 'toggleMaximize'; id: string }
  | { type: 'move'; id: string; x: number; y: number }
  | { type: 'resize'; id: string; width: number; height: number }
  /** Replaces every window at once, e.g. when switching to a Space; the last one gets focus. */
  | { type: 'restore'; windows: Array<{ appId: AppId; title: string; rect: Rect; minimized: boolean; maximized: boolean }> }

export const MIN_WINDOW_WIDTH = 280
export const MIN_WINDOW_HEIGHT = 180

export const initialWindowsState: WindowsState = {
  windows: [],
  focusedId: null,
  nextZ: 1,
  nextId: 1,
}

function topVisible(windows: WindowState[]): string | null {
  const visible = windows.filter((w) => !w.minimized)
  if (visible.length === 0) return null
  return visible.reduce((a, b) => (a.z > b.z ? a : b)).id
}

function update(state: WindowsState, id: string, patch: (w: WindowState) => WindowState): WindowsState {
  return { ...state, windows: state.windows.map((w) => (w.id === id ? patch(w) : w)) }
}

export function windowsReducer(state: WindowsState, action: WindowAction): WindowsState {
  switch (action.type) {
    case 'open': {
      // Apps are single-instance: re-opening one brings the existing window forward.
      const existing = state.windows.find((w) => w.appId === action.appId)
      if (existing) return windowsReducer(state, { type: 'focus', id: existing.id })
      const id = `win-${state.nextId}`
      const win: WindowState = {
        id,
        appId: action.appId,
        title: action.title,
        rect: action.rect,
        z: state.nextZ,
        minimized: false,
        maximized: false,
      }
      return { windows: [...state.windows, win], focusedId: id, nextZ: state.nextZ + 1, nextId: state.nextId + 1 }
    }
    case 'restore': {
      const windows = action.windows.map((w, i) => ({ ...w, id: `win-${state.nextId + i}`, z: state.nextZ + i }))
      return { windows, focusedId: topVisible(windows), nextZ: state.nextZ + windows.length, nextId: state.nextId + windows.length }
    }
    case 'close': {
      const windows = state.windows.filter((w) => w.id !== action.id)
      const focusedId = state.focusedId === action.id ? topVisible(windows) : state.focusedId
      return { ...state, windows, focusedId }
    }
    case 'focus': {
      if (!state.windows.some((w) => w.id === action.id)) return state
      const next = update(state, action.id, (w) => ({ ...w, z: state.nextZ, minimized: false }))
      return { ...next, focusedId: action.id, nextZ: state.nextZ + 1 }
    }
    case 'minimize': {
      const next = update(state, action.id, (w) => ({ ...w, minimized: true }))
      return { ...next, focusedId: state.focusedId === action.id ? topVisible(next.windows) : state.focusedId }
    }
    case 'toggleMaximize':
      return update(state, action.id, (w) => ({ ...w, maximized: !w.maximized }))
    case 'move':
      return update(state, action.id, (w) => ({ ...w, rect: { ...w.rect, x: action.x, y: Math.max(0, action.y) } }))
    case 'resize':
      return update(state, action.id, (w) => ({
        ...w,
        rect: {
          ...w.rect,
          width: Math.max(MIN_WINDOW_WIDTH, action.width),
          height: Math.max(MIN_WINDOW_HEIGHT, action.height),
        },
      }))
  }
}

/** From this width of the free desktop area (next to the sidebar) NEXUS counts as on a large screen. */
export const LARGE_AREA_WIDTH = 1200
const EDGE = 24

/**
 * Where a new window opens in a desktop area of [area] pixels. On a small screen: at the top left,
 * at its default size, a little lower and to the right for each open window. On a large screen
 * (fullscreen on a laptop or monitor) the window grows along, up to one and a half times its
 * default size, and opens in the middle; an app with [fill] (like the Agenda) fills the area.
 */
export function openRect(size: { width: number; height: number }, area: { width: number; height: number }, openCount: number, fill = false): Rect {
  const offset = (openCount % 6) * 32
  if (area.width < LARGE_AREA_WIDTH) {
    return { x: 40 + offset, y: 40 + offset, width: Math.min(size.width, area.width - 40), height: Math.min(size.height, area.height - 40) }
  }
  const maxWidth = area.width - 2 * EDGE
  const maxHeight = area.height - 2 * EDGE
  if (fill) return { x: EDGE + offset, y: EDGE + offset, width: maxWidth - offset, height: maxHeight - offset }
  const scale = Math.min(1.5, area.width / 1100)
  const width = Math.min(Math.round(size.width * scale), maxWidth)
  const height = Math.min(Math.round(size.height * scale), maxHeight)
  const place = (free: number, length: number) => Math.max(EDGE, Math.min(Math.round((free - length) / 2) + offset, free - length - EDGE))
  return { x: place(area.width, width), y: place(area.height, height), width, height }
}
