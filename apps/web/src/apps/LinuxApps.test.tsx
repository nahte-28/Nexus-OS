import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const calls: Array<[string, unknown]> = []
vi.mock('../platform/desktop', () => ({ isDesktopApp: true, isLinuxApp: true, desktopAppName: 'Linux-app', desktopOsName: 'Linux' }))
;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
  invoke: async (command: string, args: unknown) => {
    calls.push([command, args])
    if (command === 'linux_apps')
      return [
        { id: 'org.gnome.Nautilus', name: 'Bestanden', comment: 'Mappen en bestanden' },
        { id: 'firefox-esr', name: 'Firefox', comment: 'Webbrowser' },
      ]
    if (command === 'session_info') return { session: true, linux: true }
    return null
  },
  transformCallback: () => 0,
}
const { LinuxApps } = await import('./LinuxApps')
const { StartMenu } = await import('../desktop/StartMenu')
const { filterLinuxApps } = await import('../platform/session')

describe('Linux-apps', () => {
  afterEach(() => {
    cleanup()
    calls.length = 0
  })

  it('lists, searches and opens the apps on the computer', async () => {
    render(<LinuxApps />)
    expect(await screen.findByText('Bestanden')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Zoek een Linux-app' }), { target: { value: 'web' } })
    expect(screen.queryByText('Bestanden')).toBeNull()
    fireEvent.click(screen.getByText('Firefox'))
    await waitFor(() => expect(calls).toContainEqual(['linux_app_open', { id: 'firefox-esr' }]))
  })

  it('finds Linux apps in Start while typing and asks before shutting down', async () => {
    render(<StartMenu onClose={() => {}} onOpenApp={() => {}} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Zoek apps' }), { target: { value: 'firef' } })
    expect(await screen.findByRole('menuitem', { name: 'Firefox' })).toBeTruthy()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Uitschakelen' }))
    expect(calls.some(([c]) => c === 'session_power')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Ja' }))
    await waitFor(() => expect(calls).toContainEqual(['session_power', { action: 'poweroff' }]))
  })

  it('matches on name and description', () => {
    const apps = [{ id: 'a', name: 'Rekenmachine', comment: 'Calculator' }]
    expect(filterLinuxApps(apps, 'CALC')).toHaveLength(1)
    expect(filterLinuxApps(apps, '  ')).toHaveLength(1)
    expect(filterLinuxApps(apps, 'tekst')).toHaveLength(0)
  })
})
