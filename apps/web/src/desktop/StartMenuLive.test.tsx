import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const calls: string[] = []
vi.mock('../platform/desktop', () => ({ isDesktopApp: true, isLinuxApp: true, desktopAppName: 'Linux-app', desktopOsName: 'Linux' }))
;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
  invoke: async (command: string) => {
    calls.push(command)
    if (command === 'session_info') return { session: true, linux: true, live: true }
    if (command === 'linux_apps') return []
    return null
  },
  transformCallback: () => 0,
}
const { StartMenu } = await import('./StartMenu')

describe('Start on the NEXUS OS usb stick', () => {
  it('offers to install NEXUS OS', async () => {
    const onClose = vi.fn()
    render(<StartMenu onClose={onClose} onOpenApp={() => {}} />)
    fireEvent.click(await screen.findByRole('menuitem', { name: /NEXUS OS installeren/ }))
    await waitFor(() => expect(calls).toContain('session_install_os'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
