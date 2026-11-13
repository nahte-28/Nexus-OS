import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const calls: Array<[string, unknown]> = []
const installedApps: Array<Record<string, unknown>> = []
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
    if (command === 'store_installed') return installedApps
    if (command === 'store_search') return [{ id: 'org.videolan.VLC', name: 'VLC', summary: 'Mediaspeler', version: '3.0.21', installed: false }]
    if (command === 'store_install') installedApps.push({ id: 'org.videolan.VLC', name: 'VLC', summary: 'Mediaspeler', version: '3.0.21', installed: true })
    if (command === 'store_update_all') return 0
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

  it('searches Flathub, installs an app and offers to remove it', async () => {
    render(<LinuxApps />)
    fireEvent.click(screen.getByRole('tab', { name: 'Apps installeren' }))
    expect(await screen.findByText('Nog niets.')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Zoek in Flathub' }), { target: { value: 'vlc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zoeken' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Installeren' }))
    await waitFor(() => expect(calls).toContainEqual(['store_install', { id: 'org.videolan.VLC' }]))
    expect(await screen.findByText('VLC geïnstalleerd')).toBeTruthy()
    expect((await screen.findAllByRole('button', { name: 'Verwijderen' })).length).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Alles bijwerken' }))
    expect(await screen.findByText('Alles is al bijgewerkt.')).toBeTruthy()
  })

  it('matches on name and description', () => {
    const apps = [{ id: 'a', name: 'Rekenmachine', comment: 'Calculator' }]
    expect(filterLinuxApps(apps, 'CALC')).toHaveLength(1)
    expect(filterLinuxApps(apps, '  ')).toHaveLength(1)
    expect(filterLinuxApps(apps, 'tekst')).toHaveLength(0)
  })
})
