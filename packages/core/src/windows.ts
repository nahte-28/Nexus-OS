/** Pure window-manager state, shared by every runtime (web, Tauri). */

export type AppId = 'notes' | 'notifications' | 'devices' | 'assistant' | 'reminders' | 'account' | 'settings' | 'developer' | 'profiles' | 'klashub' | 'flows' | 'agenda' | 'files' | 'study' | 'grades' | 'habits' | 'flashcards' | 'insights' | 'finance' | 'journal' | 'about' | 'help' | 'spaces' | 'inbox' | 'timemachine' | 'bridge' | 'intelligence' | 'devhub' | 'capture' | 'briefing'

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
