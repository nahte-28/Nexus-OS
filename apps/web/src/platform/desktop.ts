/**
 * Adapter for the NEXUS Windows app (Tauri, apps/desktop). The same interface runs in the
 * browser and in the app; native features are only loaded when running inside the app.
 */

import { logEvent } from '../devtools/log'

/** True when this page runs inside the NEXUS Windows app instead of a browser. */
export const isDesktopApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Shows a Windows notification through the app; resolves to false when not allowed. */
export async function notifyDesktop(title: string, body: string): Promise<boolean> {
  const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification')
  let granted = await isPermissionGranted()
  if (!granted) granted = (await requestPermission()) === 'granted'
  if (granted) sendNotification({ title, body })
  return granted
}

export async function isAutostartEnabled(): Promise<boolean> {
  const { isEnabled } = await import('@tauri-apps/plugin-autostart')
  return isEnabled()
}

export async function setAutostart(enabled: boolean): Promise<void> {
  const { enable, disable } = await import('@tauri-apps/plugin-autostart')
  await (enabled ? enable() : disable())
}

/**
 * Where the NEXUS server functions (like NEXUS AI) live. The web app calls its own host;
 * the Windows app has no server of its own and calls the live NEXUS.
 */
export const apiBase = isDesktopApp
  ? ((import.meta.env.VITE_NEXUS_HOST as string | undefined)?.replace(/\/+$/, '') || 'https://nexus-os-lime.vercel.app')
  : ''

/**
 * Opens a website app (like KlasHub): in the default browser from the Windows app, a new tab
 * in the browser. Its own NEXUS window stayed black on Windows.
 */
export async function openWebApp(url: string): Promise<void> {
  if (isDesktopApp) {
    const { invoke } = await import('@tauri-apps/api/core')
    try {
      await invoke('open_in_browser_command', { url })
    } catch (err) {
      logEvent('system', `Website openen mislukt: ${String(err)}`, true)
    }
    return
  }
  window.open(url, '_blank', 'noopener')
}
