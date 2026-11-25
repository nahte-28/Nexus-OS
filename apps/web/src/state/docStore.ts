import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { refreshChannels, registerChannel, reportSync } from '../offline/channels'
import { logEvent } from '../devtools/log'
import { readStorage, writeStorage } from './storage'
import { watchSetting } from '../sync/settingsChannel'

/**
 * A small document that lives on this device (localStorage) and, with an account, in one row of
 * user_settings: Cijfers and Gewoontes. Every change bumps the revision; syncing merges both copies
 * with [merge] and writes the result to whichever side is behind.
 */
export class DocStore<T extends { revision: number }> {
  private state: T
  private listeners = new Set<() => void>()

  constructor(
    readonly storageKey: string,
    parse: (raw: unknown) => T,
  ) {
    let raw: unknown = null
    try {
      raw = JSON.parse(readStorage(storageKey) ?? 'null')
    } catch {
      raw = null
    }
    this.state = parse(raw)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): T => this.state

  update(change: (state: T) => T): void {
    const next = change(this.state)
    this.set({ ...next, revision: Math.max(next.revision, this.state.revision + 1) })
  }

  /** Takes a copy from the account as it is. */
  adopt(state: T): void {
    this.set(state)
  }

  private set(state: T): void {
    this.state = state
    writeStorage(this.storageKey, JSON.stringify(state))
    this.listeners.forEach((l) => l())
  }
}

export interface DocRemote<T> {
  pull(): Promise<T | null>
  /** False when the account already holds a copy that is as new or newer. */
  push(state: T): Promise<boolean>
}

interface Row {
  value: unknown
  revision: number
}
interface Waiter {
  resolve: (row: Row | null) => void
  reject: (err: unknown) => void
}
/** Waits this long for other documents, so syncing at start or on return to the app is one request. */
export const PULL_BATCH_MS = 20
const batches = new WeakMap<SupabaseClient, Map<string, Waiter[]>>()

/**
 * Reads one row of user_settings. Rows asked for within [PULL_BATCH_MS] go in one request: at
 * startup and when you come back to NEXUS every document syncs at once, which on a phone saves
 * some twenty round trips.
 */
export function pullSetting(client: SupabaseClient, key: string): Promise<Row | null> {
  return new Promise((resolve, reject) => {
    let waiting = batches.get(client)
    if (!waiting) {
      waiting = new Map()
      batches.set(client, waiting)
      setTimeout(() => void flushPulls(client), PULL_BATCH_MS)
    }
    waiting.set(key, [...(waiting.get(key) ?? []), { resolve, reject }])
  })
}

async function flushPulls(client: SupabaseClient): Promise<void> {
  const waiting = batches.get(client)
  batches.delete(client)
  if (!waiting) return
  try {
    const { data, error } = await client.from('user_settings').select('key,value,revision').in('key', [...waiting.keys()])
    if (error) throw error
    const rows = new Map(((data ?? []) as Array<{ key: string; value: unknown; revision: unknown }>).map((r) => [r.key, { value: r.value, revision: Number(r.revision) }]))
    for (const [key, list] of waiting) for (const w of list) w.resolve(rows.get(key) ?? null)
  } catch (err) {
    for (const list of waiting.values()) for (const w of list) w.reject(err)
  }
}

export function createDocRemote<T extends { revision: number }>(client: SupabaseClient, key: string, parse: (raw: unknown) => T): DocRemote<T> {
  return {
    async pull() {
      const row = await pullSetting(client, key)
      return row ? { ...parse(row.value), revision: row.revision } : null
    },
    async push(state) {
      const { data, error } = await client.from('user_settings').upsert({ key, value: state, revision: state.revision }, { onConflict: 'user_id,key' }).select('revision')
      if (error) throw error
      return (data ?? []).length > 0
    },
  }
}

/** JSON that ignores the revision and the order of lists, to tell whether two copies hold the same. */
function canonical(value: unknown): string {
  const walk = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(walk).map((v) => JSON.stringify(v)).sort() : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'revision').sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, walk(v)])) : x
  return JSON.stringify(walk(value))
}

/** One round: merge with the account's copy and bring both sides up to date. Returns the revision both now hold. */
export async function syncDoc<T extends { revision: number }>(store: DocStore<T>, remote: DocRemote<T>, merge: (a: T, b: T) => T, onMerge?: () => void): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const local = store.getSnapshot()
    const theirs = await remote.pull()
    if (!theirs) {
      if (await remote.push(local)) return local.revision
      continue
    }
    const merged = merge(local, theirs)
    const same = (a: T, b: T) => JSON.stringify({ ...a, revision: 0 }) === JSON.stringify({ ...b, revision: 0 })
    if (same(merged, theirs)) {
      if (!same(local, theirs) || local.revision !== theirs.revision) store.adopt(theirs)
      return theirs.revision
    }
    const next = { ...merged, revision: Math.max(local.revision, theirs.revision) + 1 }
    // Both sides brought something the other did not have: the Offline-centrum shows it as merged.
    if (onMerge && canonical(merged) !== canonical(theirs) && canonical(merged) !== canonical(local)) onMerge()
    // Another device may have written in between; then merge again with its copy.
    if (await remote.push(next)) {
      if (store.getSnapshot() === local) store.adopt(next)
      return next.revision
    }
  }
  throw new Error('Andere apparaten bleven tegelijk schrijven; NEXUS probeert het straks opnieuw.')
}

/** Why a sync failed, in words; the SQL to run when the key is not allowed yet. */
export function docSyncError(err: unknown, migration: string): string {
  const text = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String(err.message) : String(err)
  if (/user_settings_key_check|violates check constraint/i.test(text)) return `setup:${migration}`
  return text
}

/** Problems shown in the app: 'setup:<file>' asks for the SQL, other text is an error. */
export function createProblem() {
  let problem: string | null = null
  const listeners = new Set<() => void>()
  return {
    set(next: string | null) {
      if (next === problem) return
      problem = next
      listeners.forEach((l) => l())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => problem,
  }
}

/** Keeps [store] in sync with the account whenever someone is signed in. */
export function startDocSync<T extends { revision: number }>(
  client: SupabaseClient | null,
  store: DocStore<T>,
  options: { key: string; parse: (raw: unknown) => T; merge: (a: T, b: T) => T; migration: string; problem: ReturnType<typeof createProblem>; label: string },
): () => void {
  if (!client) return () => {}
  const remote = createDocRemote(client, options.key, options.parse)
  let signedIn = false
  let running = false
  let again = false
  let pushed = -1
  let debounce: ReturnType<typeof setTimeout> | undefined
  const run = async () => {
    if (!signedIn) return
    if (running) {
      again = true
      return
    }
    running = true
    const hadLocal = pushed !== -1 && store.getSnapshot().revision > pushed
    let merged = false
    try {
      pushed = await syncDoc(store, remote, options.merge, () => (merged = true))
      options.problem.set(null)
      reportSync(options.key, options.label, merged ? 'merged' : 'ok', merged ? 'Wijzigingen van twee apparaten samengevoegd; per onderdeel wint de nieuwste.' : hadLocal ? 'Wijzigingen verstuurd' : '', Date.now(), !merged && !hadLocal)
    } catch (err) {
      const message = docSyncError(err, options.migration)
      options.problem.set(message)
      reportSync(options.key, options.label, 'failed', message.startsWith('setup:') ? `De SQL-stap ${message.slice(6).split('/').pop()} ontbreekt.` : message)
      logEvent('sync', `${options.label} synchroniseren mislukt: ${message}`)
    } finally {
      running = false
      if (again) {
        again = false
        void run()
      }
    }
  }
  const setSession = (session: Session | null) => {
    // getSession and the first auth event both report the same session: sync once, not twice,
    // and not again on every token refresh.
    const was = signedIn
    signedIn = !!session
    if (signedIn && !was) void run()
  }
  void client.auth.getSession().then(({ data }) => setSession(data.session))
  const { data } = client.auth.onAuthStateChange((_event, session) => setSession(session))
  const unregister = registerChannel({ id: options.key, label: options.label, pending: () => (signedIn && store.getSnapshot().revision > pushed ? 1 : 0), syncNow: run })
  const unsubscribe = store.subscribe(() => {
    refreshChannels()
    if (store.getSnapshot().revision <= pushed) return
    clearTimeout(debounce)
    debounce = setTimeout(() => void run(), 1500)
  })
  const now = () => void run()
  const onVisible = () => document.visibilityState === 'visible' && now()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', now)
  // Another device changed this document: sync now, not at the next poll.
  const unwatch = watchSetting(client, options.key, now)
  const poll = setInterval(now, 5 * 60_000)
  return () => {
    clearTimeout(debounce)
    clearInterval(poll)
    unwatch()
    unsubscribe()
    unregister()
    data.subscription.unsubscribe()
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', now)
  }
}
