import { discordActivity, parseDiscordSettings, sameActivity, type DiscordActivity, type DiscordSettings } from '@nexus/core'
import { useSyncExternalStore } from 'react'
import { logEvent } from '../devtools/log'
import { isDesktopApp } from '../platform/desktop'
import { readStorage, writeStorage } from '../state/storage'
import { gamingStore } from './store'

/** The NEXUS application on Discord (public, no secret). */
export const DISCORD_CLIENT_ID = (import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined) || '1574827851658825830'
const KEY = 'nexus.discord'

type Listener = () => void
const listeners = new Set<Listener>()
let problem: string | null = null
const read = (): DiscordSettings => {
  try {
    return parseDiscordSettings(JSON.parse(readStorage(KEY) ?? 'null'))
  } catch {
    return parseDiscordSettings(null)
  }
}
let snapshot: { settings: DiscordSettings; problem: string | null } = { settings: read(), problem }
const emit = () => {
  snapshot = { settings: read(), problem }
  listeners.forEach((l) => l())
}
export const discordStore = {
  getSnapshot: () => snapshot,
  subscribe(l: Listener) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}
export const useDiscord = () => useSyncExternalStore(discordStore.subscribe, discordStore.getSnapshot)
export function setDiscordSettings(patch: Partial<DiscordSettings>): void {
  writeStorage(KEY, JSON.stringify({ ...read(), ...patch }))
  emit()
}
function setProblem(text: string | null): void {
  if (text === problem) return
  problem = text
  if (text) logEvent('system', `Discord: ${text}`, true)
  emit()
}

export interface DiscordBridge {
  set(a: DiscordActivity): Promise<void>
  clear(): Promise<void>
}

const tauriBridge: DiscordBridge = {
  async set(a) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('discord_set_activity', { clientId: DISCORD_CLIENT_ID, details: a.details, status: a.status, startMs: a.startMs })
  },
  async clear() {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('discord_clear')
  },
}

/** How often to try again while Discord was closed: it may have started since. */
const RETRY_MS = 60_000

/**
 * Follows the Gaming timer (also started on the phone or watch, through sync) and keeps the status
 * on Discord the same. Only the Windows- and Linux-app can reach Discord.
 */
export function watchDiscord(bridge: DiscordBridge = tauriBridge, current = () => discordActivity(gamingStore.getSnapshot(), discordStore.getSnapshot().settings)): () => void {
  let shown: DiscordActivity | null = null
  let busy = Promise.resolve()
  const sync = () => {
    const next = current()
    busy = busy.then(async () => {
      if (sameActivity(shown, next) && problem === null) return
      try {
        if (next) await bridge.set(next)
        else if (shown) await bridge.clear()
        shown = next
        setProblem(null)
      } catch (err) {
        // Nothing to show and Discord is closed: nothing is wrong.
        if (!next) {
          shown = null
          setProblem(null)
        } else setProblem(String(err instanceof Error ? err.message : err))
      }
    })
  }
  const offs = [gamingStore.subscribe(sync), discordStore.subscribe(sync)]
  const timer = setInterval(() => problem !== null && sync(), RETRY_MS)
  sync()
  return () => {
    offs.forEach((off) => off())
    clearInterval(timer)
  }
}

export function startDiscordStatus(): (() => void) | undefined {
  if (!isDesktopApp || !DISCORD_CLIENT_ID) return undefined
  return watchDiscord()
}
