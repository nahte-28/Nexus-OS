import { useSyncExternalStore } from 'react'
import type { SupabaseClient, Session } from '@supabase/supabase-js'
import {
  changeItems,
  dueForArchive,
  ingest,
  markSeen,
  mergeInbox,
  mergeInboxRules,
  parseInboxPolicy,
  parseInboxRules,
  sameDelivery,
  toInboxEntry,
  type InboxEntry,
  type InboxPolicy,
  type InboxRulesState,
  type NexusEvent,
} from '@nexus/core'
import { logEvent } from '../devtools/log'
import { isDesktopApp } from '../platform/desktop'
import { createProblem, DocStore, startDocSync } from '../state/docStore'
import { readStorage, writeStorage } from '../state/storage'

export const INBOX_MIGRATION = 'supabase/migrations/20261029190000_inbox.sql'
export const INBOX_V2_MIGRATION = 'supabase/migrations/20261102090000_inbox_v2.sql'
const KEY = 'nexus.inbox'
/** Where Inbox 1.0 kept its on/off switches on this device; taken over once into the rules. */
const POLICY_KEY = 'nexus.inbox.policy'
const DEVICE_KEY = 'nexus.inbox.device'

/** Inbox 2.0: the rule per source, the same on every device (user_settings key 'inbox'). */
export function createRulesStore(persist = true): DocStore<InboxRulesState> {
  const store = new DocStore<InboxRulesState>(persist ? 'nexus.inbox.rules' : 'nexus.inbox.rules.test', parseInboxRules)
  if (!persist) return store
  const old = readStorage(POLICY_KEY)
  if (old && store.getSnapshot().revision === 0) {
    try {
      const rules = parseInboxPolicy(JSON.parse(old))
      if (Object.keys(rules).length > 0) store.update((s) => ({ ...s, rules, updatedAt: 1 }))
    } catch {
      // A broken old copy: start with every source on.
    }
  }
  return store
}

export const inboxRulesStore = createRulesStore(typeof window !== 'undefined')
export const inboxRulesProblem = createProblem()

/** The name this device has in the delivery status: its Connect name once known, else a kind. */
let deviceNameSource: () => string | undefined = () => undefined
export function setInboxDeviceName(source: () => string | undefined): void {
  deviceNameSource = source
}
export function inboxDeviceName(): string {
  const connect = deviceNameSource()
  if (connect) {
    if (readStorage(DEVICE_KEY) !== connect) writeStorage(DEVICE_KEY, connect)
    return connect
  }
  const stored = readStorage(DEVICE_KEY)
  if (stored) return stored
  if (isDesktopApp) return 'Windows-app'
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  return /Android|iPhone|iPad/i.test(ua) ? 'Gsm (browser)' : 'Browser'
}

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
  private dirty: Set<string>
  private listeners = new Set<() => void>()

  constructor(
    private persist = true,
    readonly rules: DocStore<InboxRulesState> = persist ? inboxRulesStore : createRulesStore(false),
    private device: () => string = inboxDeviceName,
  ) {
    const raw = persist ? readJson<unknown[]>(KEY, []) : []
    this.items = Array.isArray(raw) ? raw.map(toInboxEntry).filter((i): i is InboxEntry => i !== null) : []
    this.dirty = new Set(persist ? readJson<string[]>(`${KEY}.dirty`, []) : [])
    rules.subscribe(() => this.listeners.forEach((l) => l()))
  }

  getSnapshot = (): InboxEntry[] => this.items
  getPolicy = (): InboxPolicy => this.rules.getSnapshot().rules
  pending = (): InboxEntry[] => this.items.filter((i) => this.dirty.has(i.id))

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  add(events: NexusEvent[], now = Date.now()): void {
    const next = ingest(this.items, events, this.getPolicy(), this.device())
    if (next === this.items) return
    const known = new Set(this.items.map((i) => i.id))
    for (const i of next) if (!known.has(i.id)) this.dirty.add(i.id)
    this.set(next)
    this.tidy(now)
  }

  change(ids: string[], change: Parameters<typeof changeItems>[2], now = Date.now()): void {
    ids.forEach((id) => this.dirty.add(id))
    this.set(changeItems(this.items, ids, change, now, this.device()))
  }

  setPolicy(policy: InboxPolicy, now = Date.now()): void {
    this.rules.update((s) => ({ ...s, rules: parseInboxPolicy(policy), updatedAt: now }))
    this.tidy(now)
  }

  /** Archives what a rule says may go by itself. */
  tidy(now = Date.now()): void {
    const due = dueForArchive(this.items, this.getPolicy(), now)
    if (due.length > 0) this.change(due, { archived: true, read: true }, now)
  }

  /** Notes that this device has every item, for the delivery status. */
  markSeen(now = Date.now()): void {
    const next = markSeen(this.items, this.device(), now)
    if (next === this.items) return
    const before = new Map(this.items.map((i) => [i.id, i]))
    for (const i of next) if (before.get(i.id) !== i) this.dirty.add(i.id)
    this.set(next)
  }

  /** Takes in what the account has; a newer local change stays. */
  receive(remote: InboxEntry[], withDelivery = true): void {
    const merged = mergeInbox(this.items, remote)
    if (withDelivery) {
      // Delivery known here but not yet in the account goes back up.
      const theirs = new Map(remote.map((i) => [i.id, i]))
      for (const i of merged) {
        const r = theirs.get(i.id)
        if (r && !sameDelivery(r.delivery, i.delivery)) this.dirty.add(i.id)
      }
    }
    this.set(merged)
  }

  /** The account now has these exact versions. */
  confirm(sent: InboxEntry[]): void {
    for (const s of sent) {
      const now = this.items.find((i) => i.id === s.id)
      if (!now || (now.updatedAt === s.updatedAt && sameDelivery(now.delivery, s.delivery))) this.dirty.delete(s.id)
    }
    this.save()
  }

  /** As [confirm], for an account that cannot keep the delivery status yet. */
  confirmWithoutDelivery(sent: InboxEntry[]): void {
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

/** Syncs the rules once the Inbox is on, so an account without the SQL step gets no errors. */
export function startInboxRulesSync(client: SupabaseClient | null, enabled: () => boolean, onEnabled: (l: () => void) => () => void): () => void {
  let stop: (() => void) | null = null
  const start = () => {
    if (stop || !enabled()) return
    stop = startDocSync(client, inboxRulesStore, { key: 'inbox', parse: parseInboxRules, merge: mergeInboxRules, migration: INBOX_V2_MIGRATION, problem: inboxRulesProblem, label: 'Inbox-regels' })
  }
  start()
  const off = onEnabled(start)
  return () => {
    off()
    stop?.()
  }
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
  delivery?: unknown
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
  delivery: i.delivery,
})

const fromRow = (r: Row) =>
  toInboxEntry({ ...r, body: r.body ?? undefined, link: r.link ?? undefined, deviceId: r.device_id ?? undefined, readAt: r.read_at, archivedAt: r.archived_at, snoozedUntil: r.snoozed_until, updatedAt: Number(r.updated_at), at: Number(r.at), delivery: r.delivery ?? {} })

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

/** The account has no delivery column yet (Inbox 2.0 SQL not run): sync without it. */
const noDeliveryColumn = (err: { code?: string; message?: string }) => /delivery/i.test(err.message ?? '') && /42703|PGRST204|column/i.test(`${err.code ?? ''} ${err.message ?? ''}`)

/**
 * One round with the account: send what changed here, then take in what changed elsewhere.
 * Without the Inbox 2.0 SQL step it still syncs, just without the delivery status; [onOld] says so.
 */
export async function syncInbox(client: SupabaseClient, store: InboxStore = inboxStore, cursorKey = `${KEY}.cursor`, onOld: () => void = () => {}): Promise<void> {
  const pending = store.pending()
  let withDelivery = true
  if (pending.length > 0) {
    let { error } = await client.from('inbox_items').upsert(pending.map(toRow), { onConflict: 'user_id,id' })
    if (error && noDeliveryColumn(error)) {
      withDelivery = false
      onOld()
      ;({ error } = await client.from('inbox_items').upsert(
        pending.map((i) => {
          const { delivery: _delivery, ...row } = toRow(i)
          return row
        }),
        { onConflict: 'user_id,id' },
      ))
      if (!error) {
        // Keep this device's own record; it goes up once the column exists.
        store.confirmWithoutDelivery(pending)
      }
    } else if (!error) store.confirm(pending)
    if (error) throw error
  }
  let cursor = readStorage(cursorKey) ?? '1970-01-01T00:00:00Z'
  for (;;) {
    // A little overlap: rows committing late can carry a slightly older synced_at.
    const since = new Date(Date.parse(cursor) - 30_000).toISOString()
    const { data, error } = await client.from('inbox_items').select('*').gt('synced_at', since).order('synced_at').limit(500)
    if (error) throw error
    const rows = (data ?? []) as Row[]
    if (rows.length > 0 && !('delivery' in rows[0])) withDelivery = false
    store.receive(
      rows.map(fromRow).filter((i): i is InboxEntry => i !== null),
      withDelivery,
    )
    if (rows.length === 0) break
    const last = rows[rows.length - 1].synced_at
    if (last === cursor) break
    cursor = last
    writeStorage(cursorKey, cursor)
    if (rows.length < 500) break
  }
  if (!withDelivery) return onOld()
  store.markSeen()
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
      let old = false
      await syncInbox(client, inboxStore, undefined, () => (old = true))
      setProblem(old ? `setup:${INBOX_V2_MIGRATION}` : null)
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
