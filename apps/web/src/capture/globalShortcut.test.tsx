import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The Windows/Linux app: a desktop build with Tauri's event API.
vi.mock('../platform/desktop', () => ({ isDesktopApp: true }))
const listeners = new Map<string, () => void>()
const unlisten = vi.fn()
vi.mock('@tauri-apps/api/event', () => ({
  listen: (event: string, cb: () => void) => {
    listeners.set(event, cb)
    return Promise.resolve(unlisten)
  },
}))

const { QUICK_CAPTURE_EVENT, useCaptureShortcut } = await import('./QuickCaptureHost')
const { captureState, closeCapture } = await import('./open')

function Host() {
  useCaptureShortcut()
  return null
}

afterEach(() => {
  cleanup()
  closeCapture()
})

describe('Ctrl+Shift+Space from another program (desktop app)', () => {
  it('opens Snelle notitie when the desktop app sends the shortcut, and stops listening on unmount', async () => {
    const view = render(<Host />)
    await vi.waitFor(() => expect(listeners.has(QUICK_CAPTURE_EVENT)).toBe(true))
    expect(captureState.getSnapshot().open).toBe(false)
    act(() => listeners.get(QUICK_CAPTURE_EVENT)!())
    expect(captureState.getSnapshot().open).toBe(true)
    view.unmount()
    expect(unlisten).toHaveBeenCalled()
  })
})
