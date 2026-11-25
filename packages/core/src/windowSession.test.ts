import { describe, expect, it } from 'vitest'
import { initialWindowsState, windowsReducer, type WindowsState } from './windows'
import { fitRect, MAX_SESSION_WINDOWS, parseWindowSession, saveWindowSession } from './windowSession'

const area = { width: 1366, height: 812 }
const all = () => true

function open(...apps: Array<'notes' | 'agenda' | 'clock'>): WindowsState {
  return apps.reduce(
    (s, appId, i) => windowsReducer(s, { type: 'open', appId, title: appId, rect: { x: 40 * i, y: 30 * i, width: 600, height: 400 } }),
    initialWindowsState,
  )
}

describe('window session', () => {
  it('keeps the taskbar order and which window was in front', () => {
    let state = open('notes', 'agenda', 'clock')
    // Bring Notities to the front, minimize Klok.
    state = windowsReducer(state, { type: 'focus', id: state.windows[0].id })
    state = windowsReducer(state, { type: 'minimize', id: state.windows[2].id })
    const saved = saveWindowSession(state)
    expect(saved.windows.map((w) => [w.appId, w.layer])).toEqual([
      ['notes', 2],
      ['agenda', 0],
      ['clock', 1],
    ])
    const back = parseWindowSession(JSON.parse(JSON.stringify(saved)), area, all)
    expect(back.map((w) => [w.appId, w.minimized, w.layer])).toEqual([
      ['notes', false, 2],
      ['agenda', false, 0],
      ['clock', true, 1],
    ])
    const restored = windowsReducer(initialWindowsState, { type: 'restore', windows: back.map((w) => ({ ...w, title: w.appId })) })
    expect(restored.windows.map((w) => w.appId)).toEqual(['notes', 'agenda', 'clock'])
    expect(restored.windows.find((w) => w.id === restored.focusedId)?.appId).toBe('notes')
  })

  it('leaves out apps that are switched off or no longer exist', () => {
    const saved = saveWindowSession(open('notes', 'agenda'))
    expect(parseWindowSession(saved, area, (id) => id !== 'agenda').map((w) => w.appId)).toEqual(['notes'])
  })

  it('keeps every window reachable on a smaller screen', () => {
    expect(fitRect({ x: 1800, y: 900, width: 2000, height: 1200 }, { width: 1024, height: 700 })).toEqual({ x: 0, y: 660, width: 1024, height: 700 })
    expect(fitRect({ x: -300, y: -50, width: 100, height: 100 }, area)).toEqual({ x: 0, y: 0, width: 280, height: 180 })
  })

  it('ignores anything unreadable, an old version or duplicates', () => {
    expect(parseWindowSession(null, area, all)).toEqual([])
    expect(parseWindowSession({ v: 99, windows: [] }, area, all)).toEqual([])
    expect(parseWindowSession({ v: 1, windows: [{ appId: 'notes', rect: { x: 'a' } }] }, area, all)).toEqual([])
    const dup = { v: 1, windows: [{ appId: 'notes', rect: { x: 0, y: 0, width: 400, height: 300 } }, { appId: 'notes', rect: { x: 50, y: 50, width: 400, height: 300 } }] }
    expect(parseWindowSession(dup, area, all)).toEqual([{ appId: 'notes', rect: { x: 50, y: 50, width: 400, height: 300 }, minimized: false, maximized: false, layer: 0 }])
  })

  it('keeps at most a dozen windows', () => {
    const many = { v: 1, windows: Array.from({ length: 20 }, (_, i) => ({ appId: `app${i}`, rect: { x: 0, y: 0, width: 400, height: 300 } })) }
    expect(parseWindowSession(many, area, all)).toHaveLength(MAX_SESSION_WINDOWS)
  })
})
