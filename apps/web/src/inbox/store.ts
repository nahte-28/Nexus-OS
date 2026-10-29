import { useSyncExternalStore } from 'react'
import type { SupabaseClient, Session } from '@supabase/supabase-js'
import { changeItems, ingest, mergeInbox, toInboxEntry, type InboxEntry, type InboxPolicy, type NexusEvent } from '@nexus/core'
import { logEvent } from '../devtools/log'
import { readStorage, writeStorage } from '../state/storage'

export const INBOX_MIGRATION = 'supabase/migrations/20261029190000_inbox.sql'
const KEY = 'nexus.inbox'
const POLICY_KEY = 'nexus.inbox.policy'

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(readStorage(key) ?? 'null') as T) ?? fallback
  } catch {
    return fallback
  }
}

/** The Universal Inbox on this device; changes wait in [dirty] until the account has them. */
export class InboxStore {
  private items: InboxEntry[]
  private policy: InboxPolicy
  private dirty: Set<string>
  private listeners = new Set<() => void>()

  constructor(private persist = true) {
    const raw = persist ? readJson<unknown[]>(KEY, []) : []
    this.items = Array.isArray(raw) ? raw.map(toInboxEntry).filter((i): i is InboxEntry => i !== null) : []
    this.policy = persist ? readJson<InboxPolicy>(POLICY_KEY, {}) : {}
    this.dirty = new Set(persist ? readJson<string[]>(`${KEY}.dirty`, []) : [])
  }

  getSnapshot = (): InboxEntry[] => this.items
  getPolicy = (): InboxPolicy => this.policy
  pending = (): InboxEntry[] => this.items.filter((i) => this.dirty.has(i.id))

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  add(events: NexusEvent[]): void {
    const next = ingest(this.items, events, this.policy)
    if (next === this.items) return
    const known = new Set(this.items.map((i) => i.id))
    for (const i of next) if (!known.has(i.id)) this.dirty.add(i.id)
    this.set(next)
  }

  change(ids: string[], change: Parameters<typeof changeItems>[2], now = Date.now()): void {
    ids.forEach((id) => this.dirty.add(id))
    this.set(changeItems(this.items, ids, change, now))
  }

  setPolicy(policy: InboxPolicy): void {
    this.policy = policy
    if (this.persist) writeStorage(POLICY_KEY, JSON.stringify(policy))
    this.listeners.forEach((l) => l())
  }

  /** Takes in what the account has; a newer local change stays. */
  receive(remote: InboxEntry[]): void {
    this.set(mergeInbox(this.items, remote))
  }

  /** The account now has these exact versions. */
  confirm(sent: InboxEntry[]): void {
    for (const s of sent) {
      const now = this.items.find((i) => i.id === s.id)
      if (!now || now.updatedAt === s.updatedAt) this.dirty.delete(s.id)
    }
    this.save()
  }

  private set(items: InboxEntry[]): void {
    this.items = items
    const ids = new Set(items.map((i) => i.id))
    for (const id of this.dirty) if (!ids.has(id)) this.dirty.delete(id)
    this.save()
    this.listeners.forEach((l) => l())
  }

  private save(): void {
    if (!this.persist) return
    writeStorage(KEY, JSON.stringify(this.items))
    writeStorage(`${KEY}.dirty`, JSON.stringify([...this.dirty]))
  }
}

export const inboxStore = new InboxStore(typeof window !== 'undefined')

export function useInbox(store: InboxStore = inboxStore): InboxEntry[] {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

export function useInboxPolicy(store: InboxStore = inboxStore): InboxPolicy {
  return useSyncExternalStore(store.subscribe, store.getPolicy)
}

interface Row {
  id: string
  source: string
  type: string
  title: string
  body: string | null
  priority: string
  link: unknown
  device_id: string | null
  at: number
  read_at: number | null
  archived_at: number | null
  snoozed_until: number | null
  updated_at: number
  synced_at: string
}

const toRow = (i: InboxEntry) => ({
  id: i.id,
  source: i.source,
  type: i.type,
  title: i.title,
  body: i.body ?? null,
  priority: i.priority,
  link: i.link ?? null,
  device_id: i.deviceId ?? null,
  at: i.at,
  read_at: i.readAt,
  archived_at: i.archivedAt,
  snoozed_until: i.snoozedUntil,
  updated_at: i.updatedAt,
})

const fromRow = (r: Row) =>
  toInboxEntry({ ...r, body: r.body ?? undefined, link: r.link ?? undefined, deviceId: r.device_id ?? undefined, readAt: r.read_at, archivedAt: r.archived_at, snoozedUntil: r.snoozed_until, updatedAt: Number(r.updated_at), at: Number(r.at) })

/** Why syncing stopped: 'setup:<file>' asks for the SQL step. */
let problem: string | null = null
const problemListeners = new Set<() => void>()
const setProblem = (p: string | null) => {
  if (p === problem) return
  problem = p
  problemListeners.forEach((l) => l())
}
export const inboxSyncProblem = {
  subscribe: (l: () => void) => (problemListeners.add(l), () => problemListeners.delete(l)),
  getSnapshot: () => problem,
}

/** One round with the account: send what changed here, then take in what changed elsewhere. */
export async function syncInbox(client: SupabaseClient, store: InboxStore = inboxStore, cursorKey = `${KEY}.cursor`): Promise<void> {
  const pending = store.pending()
  if (pending.length > 0) {
    const { error } = await client.from('inbox_items').upsert(pending.map(toRow), { onConflict: 'user_id,id' })
    if (error) throw error
    store.confirm(pending)
  }
  let cursor = readStorage(cursorKey) ?? '1970-01-01T00:00:00Z'
  for (;;) {
    // A little overlap: rows committing late can carry a slightly older synced_at.
    const since = new Date(Date.parse(cursor) - 30_000).toISOString()
    const { data, error } = await client.from('inbox_items').select('*').gt('synced_at', since).order('synced_at').limit(500)
    if (error) throw error
    const rows = (data ?? []) as Row[]
    store.receive(rows.map(fromRow).filter((i): i is InboxEntry => i !== null))
    if (rows.length === 0) break
    const last = rows[rows.length - 1].synced_at
    if (last === cursor) break
    cursor = last
    writeStorage(cursorKey, cursor)
    if (rows.length < 500) break
  }
}

export function inboxError(err: unknown): string {
  const text = typeof err === 'object' && err && 'message' in err ? `${(err as { code?: string }).code ?? ''} ${String((err as { message: unknown }).message)}` : String(err)
  return /42P01|PGRST205|could not find the table|does not exist/i.test(text) ? `setup:${INBOX_MIGRATION}` : text.trim()
}

/** Keeps the Inbox in sync while signed in and the module is on. */
export function startInboxSync(client: SupabaseClient | null, enabled: () => boolean, onEnabled: (l: () => void) => () => void): () => void {
  if (!client) return () => {}
  let session: Session | null = null
  let running = false
  const run = async () => {
    if (!session || !enabled() || running) return
    running = true
    try {
      await syncInbox(client)
      setProblem(null)
    } catch (err) {
      const message = inboxError(err)
      setProblem(message)
      logEvent('sync', `Inbox synchroniseren mislukt: ${message}`)
    } finally {
      running = false
    }
  }
  void client.auth.getSession().then(({ data }) => {
    session = data.session
    void run()
  })
  const { data } = client.auth.onAuthStateChange((_e, s) => {
    session = s
    void run()
  })
  let debounce: ReturnType<typeof setTimeout> | undefined
  const unsubscribe = inboxStore.subscribe(() => {
    if (inboxStore.pending().length === 0) return
    clearTimeout(debounce)
    debounce = setTimeout(() => void run(), 2000)
  })
  const now = () => void run()
  const offEnabled = onEnabled(now)
  const onVisible = () => document.visibilityState === 'visible' && now()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', now)
  const poll = setInterval(now, 2 * 60_000)
  return () => {
    clearTimeout(debounce)
    clearInterval(poll)
    unsubscribe()
    offEnabled()
    data.subscription.unsubscribe()
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', now)
  }
}
