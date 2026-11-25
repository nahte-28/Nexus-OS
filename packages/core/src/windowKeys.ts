import { snapRect, type WindowAction, type WindowsState } from './windows'

/**
 * Keyboard control of the desktop windows. Only combinations that the browser and Windows leave
 * free: Alt+Shift with an arrow or W, and Alt with the key left of 1 (² on AZERTY, ` on QWERTY,
 * matched by its physical position so it works on both).
 */

export type WindowCommand = 'next' | 'previous' | 'snapLeft' | 'snapRight' | 'maximize' | 'minimize' | 'close'

export interface KeyLike {
  key: string
  code: string
  altKey: boolean
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

/** The window command a key press asks for, or null. */
export function windowCommand(e: KeyLike): WindowCommand | null {
  if (!e.altKey || e.ctrlKey || e.metaKey) return null
  if (e.code === 'Backquote') return e.shiftKey ? 'previous' : 'next'
  if (!e.shiftKey) return null
  switch (e.key) {
    case 'ArrowLeft':
      return 'snapLeft'
    case 'ArrowRight':
      return 'snapRight'
    case 'ArrowUp':
      return 'maximize'
    case 'ArrowDown':
      return 'minimize'
  }
  return e.code === 'KeyW' ? 'close' : null
}

/** For the help pages and the Sneltoetsen list, in the order people learn them. */
export const WINDOW_SHORTCUTS: Array<[keys: string, what: string]> = [
  ['Alt+² (Alt+` op een QWERTY-toetsenbord)', 'Naar het volgende venster; met Shift erbij het vorige'],
  ['Alt+Shift+← of →', 'Het venster vastklikken aan de linker- of rechterhelft'],
  ['Alt+Shift+↑', 'Het venster maximaliseren of terugzetten'],
  ['Alt+Shift+↓', 'Het venster minimaliseren'],
  ['Alt+Shift+W', 'Het venster sluiten'],
]

/**
 * What [command] does to the windows, as reducer actions. Next/previous go through the windows in
 * taskbar order, starting from the focused one, minimized ones included (they come back).
 */
export function windowCommandActions(command: WindowCommand, state: WindowsState, area: { width: number; height: number }): WindowAction[] {
  const list = state.windows
  if (list.length === 0) return []
  const index = list.findIndex((w) => w.id === state.focusedId)
  if (command === 'next' || command === 'previous') {
    const step = command === 'next' ? 1 : -1
    const from = index < 0 ? (step === 1 ? -1 : 0) : index
    const target = list[(from + step + list.length) % list.length]
    return target.id === state.focusedId ? [] : [{ type: 'focus', id: target.id }]
  }
  const win = index < 0 ? null : list[index]
  if (!win || win.minimized) return []
  switch (command) {
    case 'snapLeft':
    case 'snapRight':
      return [{ type: 'setRect', id: win.id, rect: snapRect(command === 'snapLeft' ? 'left' : 'right', area) }]
    case 'maximize':
      return [{ type: 'toggleMaximize', id: win.id }]
    case 'minimize':
      return [{ type: 'minimize', id: win.id }]
    case 'close':
      return [{ type: 'close', id: win.id }]
  }
}
