import { describe, expect, it } from 'vitest'
import { windowCommand, windowCommandActions, type KeyLike } from './windowKeys'
import { initialWindowsState, windowsReducer, type WindowsState } from './windows'

const key = (k: Partial<KeyLike>): KeyLike => ({ key: '', code: '', altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, ...k })
const area = { width: 1200, height: 800 }

function desk(): WindowsState {
  return (['notes', 'agenda', 'clock'] as const).reduce(
    (s, appId) => windowsReducer(s, { type: 'open', appId, title: appId, rect: { x: 100, y: 100, width: 500, height: 400 } }),
    initialWindowsState,
  )
}

const run = (state: WindowsState, command: Parameters<typeof windowCommandActions>[0]) =>
  windowCommandActions(command, state, area).reduce(windowsReducer, state)

describe('window keys', () => {
  it('reads the shortcuts, by physical key for the one left of 1', () => {
    expect(windowCommand(key({ altKey: true, code: 'Backquote', key: '²' }))).toBe('next')
    expect(windowCommand(key({ altKey: true, shiftKey: true, code: 'Backquote', key: '³' }))).toBe('previous')
    expect(windowCommand(key({ altKey: true, shiftKey: true, key: 'ArrowLeft' }))).toBe('snapLeft')
    expect(windowCommand(key({ altKey: true, shiftKey: true, key: 'ArrowUp' }))).toBe('maximize')
    expect(windowCommand(key({ altKey: true, shiftKey: true, code: 'KeyW', key: 'W' }))).toBe('close')
  })

  it('leaves the browser and AltGr combinations alone', () => {
    expect(windowCommand(key({ altKey: true, key: 'ArrowLeft' }))).toBeNull() // browser back
    expect(windowCommand(key({ ctrlKey: true, code: 'KeyW', key: 'w' }))).toBeNull() // close tab
    expect(windowCommand(key({ ctrlKey: true, altKey: true, shiftKey: true, key: 'ArrowLeft' }))).toBeNull() // AltGr
    expect(windowCommand(key({ altKey: true, code: 'KeyN', key: 'n' }))).toBeNull() // Snelle notitie
  })

  it('goes through the windows in taskbar order and wraps around', () => {
    let s = desk() // clock in front
    s = run(s, 'next')
    expect(s.windows.find((w) => w.id === s.focusedId)?.appId).toBe('notes')
    s = run(s, 'previous')
    expect(s.windows.find((w) => w.id === s.focusedId)?.appId).toBe('clock')
  })

  it('brings a minimized window back when you switch to it', () => {
    let s = desk()
    s = run(s, 'minimize') // clock
    expect(s.windows.find((w) => w.appId === 'clock')?.minimized).toBe(true)
    expect(s.windows.find((w) => w.id === s.focusedId)?.appId).toBe('agenda')
    s = run(s, 'next') // agenda -> clock
    const clock = s.windows.find((w) => w.appId === 'clock')!
    expect(clock.minimized).toBe(false)
    expect(s.focusedId).toBe(clock.id)
  })

  it('snaps, maximizes and closes the focused window', () => {
    let s = run(desk(), 'snapRight')
    expect(s.windows.find((w) => w.id === s.focusedId)?.rect).toEqual({ x: 600, y: 0, width: 600, height: 800 })
    s = run(s, 'maximize')
    expect(s.windows.find((w) => w.id === s.focusedId)?.maximized).toBe(true)
    s = run(s, 'close')
    expect(s.windows.map((w) => w.appId)).toEqual(['notes', 'agenda'])
  })

  it('does nothing without windows', () => {
    expect(windowCommandActions('next', initialWindowsState, area)).toEqual([])
    expect(windowCommandActions('close', initialWindowsState, area)).toEqual([])
  })
})
