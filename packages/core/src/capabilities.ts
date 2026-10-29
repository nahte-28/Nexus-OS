/**
 * Capability registry (blueprint fase 0): what this device can do, so a module only offers what
 * works here and never shows a switch that does nothing. Pure logic; the web app detects.
 */
export type Platform = 'web' | 'pwa' | 'windows'

export type Capability =
  /** Notifications from NEXUS on this device. */
  | 'notifications'
  /** Web push: notices while NEXUS is closed. */
  | 'webPush'
  /** Linking a folder of the pc (File System Access API). */
  | 'folderAccess'
  /** Inspreken (Web Speech API). */
  | 'speech'
  /** Writing to the clipboard. */
  | 'clipboardWrite'
  /** Reading the clipboard (only on a click, with permission). */
  | 'clipboardRead'
  /** Native Windows features: tray, autostart, Windows notifications. */
  | 'native'
  /** NEXUS Connect keys (Web Crypto + IndexedDB). */
  | 'connect'

export type Capabilities = Record<Capability, boolean>

export interface CapabilityInfo {
  title: string
  /** Why it is missing, in plain words, for the places that explain it. */
  missing: string
}

export const CAPABILITY_INFO: Record<Capability, CapabilityInfo> = {
  notifications: { title: 'Meldingen', missing: 'Deze browser kan geen meldingen tonen.' },
  webPush: { title: 'Meldingen als NEXUS dicht is', missing: 'Kan alleen in Chrome, Edge of Firefox, of als geïnstalleerde web-app.' },
  folderAccess: { title: 'Mappen van je pc', missing: 'Kan alleen in Chrome en Edge op een computer.' },
  speech: { title: 'Inspreken', missing: 'Deze browser kan geen spraak omzetten; gebruik Win+H in Windows.' },
  clipboardWrite: { title: 'Kopiëren', missing: 'Kopiëren naar het klembord lukt hier niet.' },
  clipboardRead: { title: 'Plakken uit het klembord', missing: 'Deze browser laat NEXUS het klembord niet lezen.' },
  native: { title: 'Windows-functies', missing: 'Alleen in de Windows-app van NEXUS.' },
  connect: { title: 'NEXUS Connect', missing: 'Deze browser mist de versleuteling die Connect nodig heeft.' },
}

/** The capabilities [needs] lists that this device lacks; empty when the feature can run here. */
export function missingCapabilities(have: Capabilities, needs: Capability[]): Capability[] {
  return needs.filter((c) => !have[c])
}
