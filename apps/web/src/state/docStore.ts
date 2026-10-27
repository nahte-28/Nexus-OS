import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from '../devtools/log'
import { readStorage, writeStorage } from './storage'

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

export function createDocRemote<T extends { revision: number }>(client: SupabaseClient, key: string, parse: (raw: unknown) => T): DocRemote<T> {
  return {
    async pull() {
      const { data, error } = await client.from('user_settings').select('value,revision').eq('key', key).maybeSingle()
      if (error) throw error
      return data ? { ...parse(data.value), revision: Number(data.revision) } : null
    },
    async push(state) {
      const { data, error } = await client.from('user_settings').upsert({ key, value: state, revision: state.revision }, { onConflict: 'user_id,key' }).select('revision')
      if (error) throw error
      return (data ?? []).length > 0
    },
  }
}

/** One round: merge with the account's copy and bring both sides up to date. Returns the revision both now hold. */
export async function syncDoc<T extends { revision: number }>(store: DocStore<T>, remote: DocRemote<T>, merge: (a: T, b: T) => T): Promise<number> {
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
    try {
      pushed = await syncDoc(store, remote, options.merge)
      options.problem.set(null)
    } catch (err) {
      const message = docSyncError(err, options.migration)
      options.problem.set(message)
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
    signedIn = !!session
    if (signedIn) void run()
  }
  void client.auth.getSession().then(({ data }) => setSession(data.session))
  const { data } = client.auth.onAuthStateChange((_event, session) => setSession(session))
  const unsubscribe = store.subscribe(() => {
    if (store.getSnapshot().revision <= pushed) return
    clearTimeout(debounce)
    debounce = setTimeout(() => void run(), 1500)
  })
  const now = () => void run()
  const onVisible = () => document.visibilityState === 'visible' && now()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', now)
  const poll = setInterval(now, 5 * 60_000)
  return () => {
    clearTimeout(debounce)
    clearInterval(poll)
    unsubscribe()
    data.subscription.unsubscribe()
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', now)
  }
}
