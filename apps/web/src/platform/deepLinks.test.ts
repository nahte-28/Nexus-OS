import { afterEach, describe, expect, it, vi } from 'vitest'

// The Windows/Linux app: Tauri's event and command API.
const listeners = new Map<string, (event: { payload: unknown }) => void>()
let startLink: string | null = null
vi.mock('@tauri-apps/api/event', () => ({
  listen: (event: string, cb: (event: { payload: unknown }) => void) => {
    listeners.set(event, cb)
    return Promise.resolve(() => {})
  },
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string) => (command === 'deep_link_take' ? Promise.resolve(startLink) : Promise.reject(new Error(command))),
}))

const { DEEP_LINK_EVENT, openNexusLink, startDeepLinks } = await import('./deepLinks')
const { captureState, closeCapture } = await import('../capture/open')
const { setAppOpener } = await import('../shell/openApp')

afterEach(() => {
  closeCapture()
  setAppOpener(null)
  startLink = null
})

describe('nexus:// links in the desktop app', () => {
  it('fills in Snelle notitie from the link NEXUS was started with', async () => {
    startLink = 'nexus://snel?text=Melk%20kopen'
    await startDeepLinks()
    expect(captureState.getSnapshot()).toMatchObject({ open: true, text: 'Melk kopen' })
  })

  it('opens an app from a link sent while NEXUS runs, and ignores unknown links', async () => {
    const opened: string[] = []
    setAppOpener((app) => opened.push(app))
    await startDeepLinks()
    listeners.get(DEEP_LINK_EVENT)!({ payload: 'nexus://app/agenda' })
    listeners.get(DEEP_LINK_EVENT)!({ payload: 'nexus://wis-alles' })
    listeners.get(DEEP_LINK_EVENT)!({ payload: 42 })
    expect(opened).toEqual(['agenda'])
    expect(openNexusLink('https://example.com')).toBe(false)
  })
})
