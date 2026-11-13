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

interface SessionInfo {
  session: boolean
  live: boolean
}

let info: Promise<SessionInfo> | undefined

function sessionInfo(): Promise<SessionInfo> {
  if (!isLinuxApp) return Promise.resolve({ session: false, live: false })
  return (info ??= invoke<SessionInfo>('session_info').then(
    (i) => ({ session: !!i.session, live: !!i.live }),
    () => ({ session: false, live: false }),
  ))
}

/** True when NEXUS is the whole desktop (chosen as "NEXUS OS" on the login screen). */
export function isNexusSession(): Promise<boolean> {
  return sessionInfo().then((i) => i.session)
}

/** True when running from the NEXUS OS usb stick, where NEXUS OS can be installed. */
export function useLiveSystem(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let live = true
    void sessionInfo().then((i) => live && setOn(i.live))
    return () => {
      live = false
    }
  }, [])
  return on
}

/** Starts the installer on the usb stick; it asks for the password (live) itself. */
export function installNexusOs(): Promise<void> {
  return invoke('session_install_os')
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

/** An app from Flathub (apps/desktop/src-tauri/src/store.rs). */
export interface StoreApp {
  id: string
  name: string
  summary: string
  version: string
  installed: boolean
}

export const store = {
  installed: () => invoke<StoreApp[]>('store_installed'),
  search: (query: string) => invoke<StoreApp[]>('store_search', { query }),
  install: (id: string) => invoke<void>('store_install', { id }),
  remove: (id: string) => invoke<void>('store_remove', { id }),
  updateAll: () => invoke<number>('store_update_all'),
}
