import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const calls: Array<[string, unknown]> = []
let wifiOn = true
vi.mock('../platform/desktop', () => ({ isDesktopApp: true, isLinuxApp: true, desktopAppName: 'Linux-app', desktopOsName: 'Linux' }))
;(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
  invoke: async (command: string, args: unknown) => {
    calls.push([command, args])
    if (command === 'system_wifi_power') wifiOn = (args as { on: boolean }).on
    if (command === 'system_wifi')
      return {
        enabled: wifiOn,
        devices: [{ device: 'wlan0', kind: 'wifi', connected: wifiOn, connection: wifiOn ? 'Thuis' : '' }],
        networks: wifiOn
          ? [
              { ssid: 'Thuis', signal: 80, secure: true, connected: true, saved: true },
              { ssid: 'School', signal: 50, secure: true, connected: false, saved: false },
            ]
          : [],
      }
    if (command === 'system_sound')
      return {
        output: { percent: 40, muted: false },
        input: { percent: 100, muted: true },
        outputs: [
          { id: 46, name: 'Ingebouwd', default: true },
          { id: 51, name: 'HDMI', default: false },
        ],
        inputs: [],
      }
    if (command === 'system_display')
      return {
        brightness: null,
        screens: [
          {
            name: 'Virtual-1',
            description: 'VirtualBox',
            enabled: true,
            scale: 1,
            modes: [
              { width: 1920, height: 1080, refresh: 60, preferred: false, current: false },
              { width: 1280, height: 800, refresh: 60, preferred: true, current: true },
            ],
          },
        ],
      }
    if (command === 'system_updates')
      return {
        pending: [
          { package: 'firefox-esr', version: '140.5', from: '140.4', security: false },
          { package: 'openssl', version: '3.5.1-1+deb13u1', from: '3.5.1-1', security: true },
        ],
        reboot_required: true,
        checked_at: 1763020800,
      }
    if (command === 'system_bluetooth') return { available: true, powered: true, devices: [{ address: 'AA:BB:CC:DD:EE:FF', name: 'Koptelefoon', paired: false, connected: false }] }
    return null
  },
  transformCallback: () => 0,
}
const { System } = await import('./System')

describe('Systeem', () => {
  afterEach(() => {
    cleanup()
    calls.length = 0
    wifiOn = true
  })

  it('asks the password of a new wifi network and connects', async () => {
    render(<System />)
    expect(await screen.findByText('Verbonden met Thuis')).toBeTruthy()
    const school = (await screen.findByText('School')).closest('li')!
    fireEvent.click(school.querySelector('button')!)
    const field = screen.getByLabelText('Wachtwoord voor School')
    fireEvent.change(field, { target: { value: 'geheim123' } })
    fireEvent.submit(field.closest('form')!)
    await waitFor(() => expect(calls).toContainEqual(['system_wifi_connect', { ssid: 'School', password: 'geheim123' }]))
  })

  it('switches wifi off', async () => {
    render(<System />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Wifi aan' }))
    await waitFor(() => expect(calls).toContainEqual(['system_wifi_power', { on: false }]))
    expect(await screen.findByText('Uit')).toBeTruthy()
  })

  it('sets the volume, unmutes and picks the output', async () => {
    render(<System />)
    fireEvent.click(screen.getByRole('tab', { name: 'Geluid' }))
    const slider = await screen.findByLabelText('Volume luidspreker')
    fireEvent.change(slider, { target: { value: '70' } })
    fireEvent.pointerUp(slider)
    await waitFor(() => expect(calls).toContainEqual(['system_volume', { input: false, percent: 70 }]))
    fireEvent.click(await screen.findByRole('button', { name: 'Dempen uit' }))
    await waitFor(() => expect(calls).toContainEqual(['system_mute', { input: true, muted: false }]))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '51' } })
    await waitFor(() => expect(calls).toContainEqual(['system_audio_default', { id: 51 }]))
  })

  it('applies a resolution and scale', async () => {
    render(<System />)
    fireEvent.click(screen.getByRole('tab', { name: 'Beeld' }))
    const [resolution, size] = await screen.findAllByRole('combobox')
    fireEvent.change(resolution, { target: { value: '0' } })
    fireEvent.change(size, { target: { value: '1.25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toepassen' }))
    await waitFor(() =>
      expect(calls).toContainEqual(['system_screen_set', { choice: { name: 'Virtual-1', width: 1920, height: 1080, refresh: 60, scale: 1.25 } }]),
    )
  })

  it('pairs a Bluetooth device', async () => {
    render(<System />)
    fireEvent.click(screen.getByRole('tab', { name: 'Bluetooth' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Koppelen' }))
    await waitFor(() => expect(calls).toContainEqual(['system_bluetooth_device', { address: 'AA:BB:CC:DD:EE:FF', action: 'connect' }]))
  })

  it('shows waiting system updates and installs them', async () => {
    render(<System />)
    fireEvent.click(screen.getByRole('tab', { name: 'Updates' }))
    expect(await screen.findByText('2 updates klaar')).toBeTruthy()
    expect(screen.getByText('1 voor beveiliging')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Alles installeren' }))
    await waitFor(() => expect(calls.some(([c]) => c === 'system_updates_install')).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Opnieuw opstarten' }))
    await waitFor(() => expect(calls).toContainEqual(['session_power', { action: 'reboot' }]))
  })
})
