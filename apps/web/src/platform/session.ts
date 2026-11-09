/**
 * The NEXUS session on Linux (apps/desktop/src-tauri/src/session.rs): the Linux apps on the
 * computer and logging out or shutting down. Only does something in the Linux app.
 */

import { useEffect, useState } from 'react'
import { isLinuxApp } from './desktop'

export interface LinuxApp {
  id: string
  name: string
  comment: string
}

export type PowerAction = 'logout' | 'suspend' | 'reboot' | 'poweroff'

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

let session: Promise<boolean> | undefined

/** True when NEXUS is the whole desktop (chosen as "NEXUS OS" on the login screen). */
export function isNexusSession(): Promise<boolean> {
  if (!isLinuxApp) return Promise.resolve(false)
  return (session ??= invoke<{ session: boolean }>('session_info').then((i) => i.session, () => false))
}

export function useNexusSession(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let live = true
    void isNexusSession().then((v) => live && setOn(v))
    return () => {
      live = false
    }
  }, [])
  return on
}

export function listLinuxApps(): Promise<LinuxApp[]> {
  return isLinuxApp ? invoke<LinuxApp[]>('linux_apps') : Promise.resolve([])
}

/** The installed Linux apps, loaded once per component; empty outside the Linux app. */
export function useLinuxApps(): { apps: LinuxApp[]; loading: boolean; error: string | null; reload: () => void } {
  const [apps, setApps] = useState<LinuxApp[]>([])
  const [loading, setLoading] = useState(isLinuxApp)
  const [error, setError] = useState<string | null>(null)
  const [round, setRound] = useState(0)
  useEffect(() => {
    let live = true
    if (!isLinuxApp) return
    listLinuxApps().then(
      (list) => live && (setApps(list), setError(null), setLoading(false)),
      (err) => live && (setError(String(err)), setLoading(false)),
    )
    return () => {
      live = false
    }
  }, [round])
  return { apps, loading, error, reload: () => setRound((r) => r + 1) }
}

export function openLinuxApp(id: string): Promise<void> {
  return invoke('linux_app_open', { id })
}

export function sessionPower(action: PowerAction): Promise<void> {
  return invoke('session_power', { action })
}

/** Matches on the name and the description, ignoring case. */
export function filterLinuxApps(apps: LinuxApp[], query: string): LinuxApp[] {
  const q = query.trim().toLowerCase()
  if (!q) return apps
  return apps.filter((a) => a.name.toLowerCase().includes(q) || a.comment.toLowerCase().includes(q))
}
