/**
 * Systeeminstellingen on Linux (apps/desktop/src-tauri/src/system.rs): wifi, sound, screens
 * with brightness, and Bluetooth. Only does something in the Linux app.
 */

export interface WifiNetwork {
  ssid: string
  signal: number
  secure: boolean
  connected: boolean
  saved: boolean
}

export interface NetDevice {
  device: string
  kind: string
  connected: boolean
  connection: string
}

export interface WifiState {
  enabled: boolean
  devices: NetDevice[]
  networks: WifiNetwork[]
}

export interface Volume {
  percent: number
  muted: boolean
}

export interface AudioDevice {
  id: number
  name: string
  default: boolean
}

export interface SoundState {
  output: Volume | null
  input: Volume | null
  outputs: AudioDevice[]
  inputs: AudioDevice[]
}

export interface ScreenMode {
  width: number
  height: number
  refresh: number
  preferred: boolean
  current: boolean
}

export interface Screen {
  name: string
  description: string
  enabled: boolean
  modes: ScreenMode[]
  scale: number
}

export interface DisplayState {
  screens: Screen[]
  brightness: number | null
}

export interface ScreenChoice {
  name: string
  width: number
  height: number
  refresh: number
  scale: number
}

export interface BtDevice {
  address: string
  name: string
  paired: boolean
  connected: boolean
}

export interface BluetoothState {
  available: boolean
  powered: boolean
  devices: BtDevice[]
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

export const system = {
  wifi: (rescan = false) => invoke<WifiState>('system_wifi', { rescan }),
  wifiPower: (on: boolean) => invoke<void>('system_wifi_power', { on }),
  wifiConnect: (ssid: string, password?: string) => invoke<void>('system_wifi_connect', { ssid, password: password || null }),
  wifiDisconnect: (device: string) => invoke<void>('system_wifi_disconnect', { device }),
  wifiForget: (ssid: string) => invoke<void>('system_wifi_forget', { ssid }),
  sound: () => invoke<SoundState>('system_sound'),
  volume: (input: boolean, percent: number) => invoke<void>('system_volume', { input, percent: Math.round(percent) }),
  mute: (input: boolean, muted: boolean) => invoke<void>('system_mute', { input, muted }),
  audioDefault: (id: number) => invoke<void>('system_audio_default', { id }),
  display: () => invoke<DisplayState>('system_display'),
  screenSet: (choice: ScreenChoice) => invoke<void>('system_screen_set', { choice }),
  brightness: (percent: number) => invoke<void>('system_brightness', { percent: Math.round(percent) }),
  bluetooth: (scan = false) => invoke<BluetoothState>('system_bluetooth', { scan }),
  bluetoothPower: (on: boolean) => invoke<void>('system_bluetooth_power', { on }),
  bluetoothDevice: (address: string, action: 'connect' | 'disconnect' | 'forget') => invoke<void>('system_bluetooth_device', { address, action }),
}

/** Signal strength in words, for screen readers and the bars. */
export function signalLabel(signal: number): string {
  if (signal >= 70) return 'sterk'
  if (signal >= 45) return 'goed'
  if (signal >= 25) return 'zwak'
  return 'heel zwak'
}

/** "1920 × 1080 · 60 Hz" */
export function modeLabel(m: { width: number; height: number; refresh: number }): string {
  return `${m.width} × ${m.height} · ${Math.round(m.refresh)} Hz`
}

export const SCALES = [1, 1.25, 1.5, 1.75, 2]
