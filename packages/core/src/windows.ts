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
  /** Places a window at once (snapped to half the screen, or resized from an edge); it is no longer maximized. */
  | { type: 'setRect'; id: string; rect: Rect }
  /** Replaces every window at once, e.g. when switching to a Space; the last one gets focus. */
  | { type: 'restore'; windows: Array<{ appId: AppId; title: string; rect: Rect; minimized: boolean; maximized: boolean; layer?: number }> }

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
      // In list order (the taskbar's); [layer] says how far to the front (0 = back), else list order.
      const windows = action.windows.map(({ layer, ...w }, i) => ({ ...w, id: `win-${state.nextId + i}`, z: state.nextZ + (layer ?? i) }))
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
    case 'setRect':
      return update(state, action.id, (w) => ({
        ...w,
        maximized: false,
        rect: {
          x: action.rect.x,
          y: Math.max(0, action.rect.y),
          width: Math.max(MIN_WINDOW_WIDTH, action.rect.width),
          height: Math.max(MIN_WINDOW_HEIGHT, action.rect.height),
        },
      }))
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
 * default size, and opens in the middle. An app with [fill] (like the Agenda) fills the area on any screen.
 */
export function openRect(size: { width: number; height: number }, area: { width: number; height: number }, openCount: number, fill = false): Rect {
  const offset = (openCount % 6) * 32
  // An app with [fill] (like the Agenda) fills the desktop on every screen size, not only a large one.
  if (fill) {
    const edge = area.width < LARGE_AREA_WIDTH ? 12 : EDGE
    const start = Math.min(offset, Math.max(0, area.width - 2 * edge - MIN_WINDOW_WIDTH), Math.max(0, area.height - 2 * edge - MIN_WINDOW_HEIGHT))
    return { x: edge + start, y: edge + start, width: Math.max(MIN_WINDOW_WIDTH, area.width - 2 * edge - start), height: Math.max(MIN_WINDOW_HEIGHT, area.height - 2 * edge - start) }
  }
  if (area.width < LARGE_AREA_WIDTH) {
    return { x: 40 + offset, y: 40 + offset, width: Math.min(size.width, area.width - 40), height: Math.min(size.height, area.height - 40) }
  }
  const maxWidth = area.width - 2 * EDGE
  const maxHeight = area.height - 2 * EDGE
  const scale = Math.min(1.5, area.width / 1100)
  const width = Math.min(Math.round(size.width * scale), maxWidth)
  const height = Math.min(Math.round(size.height * scale), maxHeight)
  const place = (free: number, length: number) => Math.max(EDGE, Math.min(Math.round((free - length) / 2) + offset, free - length - EDGE))
  return { x: place(area.width, width), y: place(area.height, height), width, height }
}

/** An edge or corner of a window you can drag to resize it. */
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/**
 * The window after dragging [edge] by [dx], [dy] pixels: the opposite edge stays where it is, also
 * when the window hits its minimum size.
 */
export function resizeRect(rect: Rect, edge: ResizeEdge, dx: number, dy: number): Rect {
  let { x, y, width, height } = rect
  if (edge.includes('e')) width = Math.max(MIN_WINDOW_WIDTH, rect.width + dx)
  if (edge.includes('s')) height = Math.max(MIN_WINDOW_HEIGHT, rect.height + dy)
  if (edge.includes('w')) {
    width = Math.max(MIN_WINDOW_WIDTH, rect.width - dx)
    x = rect.x + rect.width - width
  }
  if (edge.includes('n')) {
    const top = Math.max(0, Math.min(rect.y + dy, rect.y + rect.height - MIN_WINDOW_HEIGHT))
    height = rect.y + rect.height - top
    y = top
  }
  return { x, y, width, height }
}

/** Where a dragged window snaps to: the left or right half of the desktop, or all of it. */
export type SnapSide = 'left' | 'right' | 'full'

/** The snap a pointer at [x], [y] in the desktop area asks for: near the left, right or top edge. */
export function snapAt(x: number, y: number, area: { width: number; height: number }, margin = 12): SnapSide | null {
  if (x <= margin) return 'left'
  if (x >= area.width - margin) return 'right'
  if (y <= margin) return 'full'
  return null
}

export function snapRect(side: SnapSide, area: { width: number; height: number }): Rect {
  const half = Math.round(area.width / 2)
  if (side === 'left') return { x: 0, y: 0, width: half, height: area.height }
  if (side === 'right') return { x: half, y: 0, width: area.width - half, height: area.height }
  return { x: 0, y: 0, width: area.width, height: area.height }
}

/**
 * A window's last place and size, brought back when it opens again; kept inside [area], so a window
 * from a big monitor still fits on a laptop. Null when nothing (valid) was remembered.
 */
export function rememberedRect(raw: unknown, area: { width: number; height: number }): Rect | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { x, y, width, height } = raw as Record<string, unknown>
  if (![x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const w = Math.max(MIN_WINDOW_WIDTH, Math.min(width as number, area.width))
  const h = Math.max(MIN_WINDOW_HEIGHT, Math.min(height as number, area.height))
  return {
    x: Math.round(Math.max(0, Math.min(x as number, area.width - w))),
    y: Math.round(Math.max(0, Math.min(y as number, area.height - h))),
    width: Math.round(w),
    height: Math.round(h),
  }
}
