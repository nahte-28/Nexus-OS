import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getValue, update } from '../state/db'

/**
 * Your own Anthropic key for NEXUS AI. It stays on this device, encrypted with a key the browser
 * keeps and will not hand out (a non-extractable AES-GCM key), and goes along with each NEXUS AI
 * request so you pay for your own use. It is not synced, not in a back-up, and the server uses it
 * for that one request only. Signing out removes it.
 */

export const OWN_KEY_HEADER = 'x-nexus-ai-key'
const OWN_KEY = /^sk-ant-[A-Za-z0-9_-]{20,300}$/
const RECORD = 'ai-own-key'

interface Sealed {
  wrap: CryptoKey
  iv: Uint8Array<ArrayBuffer>
  data: ArrayBuffer
  hint: string
  savedAt: number
}

/** Where the sealed key lives; the default is this device's IndexedDB. */
export interface OwnKeyVault {
  load(): Promise<Sealed | undefined>
  save(value: Sealed): Promise<void>
  clear(): Promise<void>
}

const idbVault: OwnKeyVault = {
  load: () => getValue<Sealed>('connect', RECORD),
  save: (value) => update('connect', { put: [value], key: RECORD }),
  clear: () => update('connect', { remove: [RECORD] }),
}

/** A key without spaces around it; null when it does not look like an Anthropic key. */
export function cleanOwnKey(raw: string): string | null {
  const key = raw.trim()
  return OWN_KEY.test(key) ? key : null
}

/** "sk-ant-…a1b2": enough to recognise your key, not enough to use it. */
export const keyHint = (key: string) => `sk-ant-…${key.slice(-4)}`

export interface OwnKeyState {
  loaded: boolean
  hint: string | null
  savedAt: number | null
}

let vault: OwnKeyVault = idbVault
let state: OwnKeyState = { loaded: false, hint: null, savedAt: null }
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()
const set = (next: OwnKeyState) => {
  state = next
  listeners.forEach((l) => l())
}

/** For tests: another place to keep the sealed key. */
export function setOwnKeyVault(v: OwnKeyVault): void {
  vault = v
  loading = null
  state = { loaded: false, hint: null, savedAt: null }
}

function load(): Promise<void> {
  loading ??= vault.load().then(
    (sealed) => set({ loaded: true, hint: sealed?.hint ?? null, savedAt: sealed?.savedAt ?? null }),
    () => set({ loaded: true, hint: null, savedAt: null }),
  )
  return loading
}

export async function saveOwnKey(raw: string, now = Date.now()): Promise<void> {
  const key = cleanOwnKey(raw)
  if (!key) throw new Error('Dat lijkt geen Anthropic-sleutel. Een sleutel begint met sk-ant- en komt van console.anthropic.com.')
  const wrap = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrap, new TextEncoder().encode(key))
  const sealed: Sealed = { wrap, iv, data, hint: keyHint(key), savedAt: now }
  await vault.save(sealed)
  loading = Promise.resolve()
  set({ loaded: true, hint: sealed.hint, savedAt: now })
}

export async function removeOwnKey(): Promise<void> {
  await vault.clear()
  loading = Promise.resolve()
  set({ loaded: true, hint: null, savedAt: null })
}

/** The key itself, only to send it along with a NEXUS AI request. */
async function readOwnKey(): Promise<string | null> {
  const sealed = await vault.load().catch(() => undefined)
  if (!sealed) return null
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv }, sealed.wrap, sealed.data)
    return cleanOwnKey(new TextDecoder().decode(plain))
  } catch {
    return null
  }
}

/** The headers of a NEXUS AI request: your login, and your own key when you set one. */
export async function aiHeaders(access: string): Promise<Record<string, string>> {
  const own = await readOwnKey()
  return { 'content-type': 'application/json', authorization: `Bearer ${access}`, ...(own ? { [OWN_KEY_HEADER]: own } : {}) }
}

export function useOwnKey(): OwnKeyState {
  void load()
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** Signing out of this device removes your own key from it. */
export function startOwnKeyGuard(client: SupabaseClient | null): () => void {
  if (!client) return () => {}
  const { data } = client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') void removeOwnKey().catch(() => {})
  })
  return () => data.subscription.unsubscribe()
}
