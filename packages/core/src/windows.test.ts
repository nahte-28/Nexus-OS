import { describe, expect, it } from 'vitest'
import { initialWindowsState, MIN_WINDOW_WIDTH, windowsReducer, type WindowAction } from './windows'

const rect = { x: 10, y: 10, width: 400, height: 300 }
const run = (...actions: WindowAction[]) => actions.reduce(windowsReducer, initialWindowsState)

describe('windowsReducer', () => {
  it('opens a window and focuses it', () => {
    const s = run({ type: 'open', appId: 'notes', title: 'Notities', rect })
    expect(s.windows).toHaveLength(1)
    expect(s.focusedId).toBe(s.windows[0].id)
  })

  it('keeps apps single-instance and brings them forward', () => {
    const s = run(
      { type: 'open', appId: 'notes', title: 'Notities', rect },
      { type: 'open', appId: 'settings', title: 'Instellingen', rect },
      { type: 'open', appId: 'notes', title: 'Notities', rect },
    )
    expect(s.windows).toHaveLength(2)
    const notes = s.windows.find((w) => w.appId === 'notes')!
    expect(s.focusedId).toBe(notes.id)
    expect(notes.z).toBeGreaterThan(s.windows.find((w) => w.appId === 'settings')!.z)
  })

  it('moves focus to the next visible window on minimize and close', () => {
    let s = run(
      { type: 'open', appId: 'notes', title: 'Notities', rect },
      { type: 'open', appId: 'settings', title: 'Instellingen', rect },
    )
    const [notes, settings] = s.windows
    s = windowsReducer(s, { type: 'minimize', id: settings.id })
    expect(s.focusedId).toBe(notes.id)
    s = windowsReducer(s, { type: 'close', id: notes.id })
    expect(s.focusedId).toBeNull()
    s = windowsReducer(s, { type: 'focus', id: settings.id })
    expect(s.windows[0].minimized).toBe(false)
    expect(s.focusedId).toBe(settings.id)
  })

  it('clamps resize and keeps the title bar on screen', () => {
    let s = run({ type: 'open', appId: 'notes', title: 'Notities', rect })
    const id = s.windows[0].id
    s = windowsReducer(s, { type: 'resize', id, width: 10, height: 10 })
    expect(s.windows[0].rect.width).toBe(MIN_WINDOW_WIDTH)
    s = windowsReducer(s, { type: 'move', id, x: 50, y: -100 })
    expect(s.windows[0].rect.y).toBe(0)
  })
})
