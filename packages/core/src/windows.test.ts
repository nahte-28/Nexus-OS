import { describe, expect, it } from 'vitest'
import { initialWindowsState, MIN_WINDOW_WIDTH, openRect, windowsReducer, type WindowAction } from './windows'

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

describe('openRect', () => {
  const agenda = { width: 760, height: 580 }

  it('keeps the default size at the top left in a small window', () => {
    expect(openRect(agenda, { width: 1056, height: 664 }, 0)).toEqual({ x: 40, y: 40, width: 760, height: 580 })
    expect(openRect(agenda, { width: 1056, height: 664 }, 1, true)).toEqual({ x: 72, y: 72, width: 760, height: 580 })
    expect(openRect(agenda, { width: 600, height: 500 }, 0)).toEqual({ x: 40, y: 40, width: 560, height: 460 })
  })

  it('grows and centres windows on a large screen', () => {
    const rect = openRect(agenda, { width: 1696, height: 1032 }, 0)
    expect(rect).toEqual({ x: 278, y: 81, width: 1140, height: 870 })
  })

  it('never opens a window outside the area', () => {
    const rect = openRect({ width: 900, height: 900 }, { width: 1300, height: 700 }, 5)
    expect(rect.x).toBeGreaterThanOrEqual(24)
    expect(rect.y).toBeGreaterThanOrEqual(24)
    expect(rect.x + rect.width).toBeLessThanOrEqual(1300 - 24)
    expect(rect.y + rect.height).toBeLessThanOrEqual(700 - 24)
  })

  it('fills the area for apps like the Agenda', () => {
    expect(openRect(agenda, { width: 1696, height: 1032 }, 0, true)).toEqual({ x: 24, y: 24, width: 1648, height: 984 })
  })
})
