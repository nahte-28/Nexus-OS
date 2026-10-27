import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { syncOnce, toLifeItem, type LifeItem, type PullResult, type RemoteStore } from '@nexus/core'
import { logEvent } from '../devtools/log'
import { lifeStore, type LifeStore } from './store'

const PAGE_SIZE = 500
/** Re-read a little before the cursor: writes committing late can carry an older synced_at. */
const OVERLAP_MS = 30_000
const PUSH_DEBOUNCE_MS = 1500
const POLL_MS = 60_000

interface LifeRow {
  id: string
  kind: LifeItem['kind']
  data: Record<string, unknown>
  updated_at: number
  deleted_at: number | null
  synced_at: string
}

/** Everything except the sync fields goes in `data`; the server never interprets it. */
export function toRow(item: LifeItem): Omit<LifeRow, 'synced_at'> {
  const { id, kind, updatedAt, deletedAt, ...data } = item
  return { id, kind, data, updated_at: updatedAt, deleted_at: deletedAt }
}

export function fromRow(row: LifeRow): LifeItem | null {
  return toLifeItem({
    ...row.data,
    id: row.id,
    kind: row.kind,
    updatedAt: Number(row.updated_at),
    deletedAt: row.deleted_at === null ? null : Number(row.deleted_at),
  })
}

export function createLifeRemote(client: SupabaseClient): RemoteStore<LifeItem> {
  return {
    async push(items) {
      const { error } = await client.from('life_items').upsert(items.map(toRow), { onConflict: 'id' })
      if (error) throw error
    },

    async pull(cursor): Promise<PullResult<LifeItem>> {
      const records: LifeItem[] = []
      let since = cursor ? new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString() : null
      let latest = cursor
      for (;;) {
        let query = client
          .from('life_items')
          .select('id,kind,data,updated_at,deleted_at,synced_at')
          .order('synced_at', { ascending: true })
          .limit(PAGE_SIZE)
        if (since) query = query.gt('synced_at', since)
        const { data, error } = await query
        if (error) throw error
        const rows = (data ?? []) as LifeRow[]
        for (const row of rows) {
          const item = fromRow(row)
          if (item) records.push(item)
        }
        if (rows.length > 0) {
          const last = rows[rows.length - 1].synced_at
          if (!latest || last > latest) latest = last
          since = last
        }
        if (rows.length < PAGE_SIZE) break
      }
      return { records, cursor: latest }
    },
  }
}

/** Shown in the Agenda app when the database still misses the NEXUS Life table. */
export const lifeSyncProblem = {
  value: null as string | null,
  listeners: new Set<() => void>(),
  set(value: string | null) {
    if (value === this.value) return
    this.value = value
    this.listeners.forEach((l) => l())
  },
  subscribe: (l: () => void) => {
    lifeSyncProblem.listeners.add(l)
    return () => lifeSyncProblem.listeners.delete(l)
  },
  getSnapshot: () => lifeSyncProblem.value,
}

function problemText(err: unknown): string {
  const e = err as { code?: string; message?: string }
  if (e?.code === '42P01' || e?.code === 'PGRST205' || /life_items/.test(e?.message ?? '')) {
    return 'setup'
  }
  return e?.message ?? String(err)
}

/** Syncs deadlines and projects whenever someone is signed in; stays local-only otherwise. */
export function startLifeSync(client: SupabaseClient | null, store: LifeStore = lifeStore): () => void {
  if (!client) return () => {}
  const remote = createLifeRemote(client)
  let session: Session | null = null
  let running: Promise<void> | null = null
  let again = false
  let debounce: ReturnType<typeof setTimeout> | undefined

  const sync = (): Promise<void> => {
    if (!session || !navigator.onLine) return Promise.resolve()
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      try {
        await store.ready
        const report = await syncOnce(store, remote)
        lifeSyncProblem.set(null)
        if (report.pushed || report.applied) logEvent('sync', `Agenda: ${report.pushed} verstuurd, ${report.applied} binnengehaald`)
      } catch (err) {
        lifeSyncProblem.set(problemText(err))
        logEvent('sync', `Agenda synchroniseren mislukt: ${problemText(err)}`, true)
      }
    })().finally(() => {
      running = null
      if (again) {
        again = false
        void sync()
      }
    })
    return running
  }

  const setSession = (next: Session | null) => {
    const before = session
    session = next
    if (!next) {
      if (before) void store.reset()
      return
    }
    if (!before || before.user.id !== next.user.id) void sync()
  }
  void client.auth.getSession().then(({ data }) => setSession(data.session))
  const { data } = client.auth.onAuthStateChange((_event, s) => setSession(s))

  const unsubscribe = store.subscribe(() => {
    if (store.dirtyIds().length === 0) return
    clearTimeout(debounce)
    debounce = setTimeout(() => void sync(), PUSH_DEBOUNCE_MS)
  })
  const now = () => void sync()
  const onVisible = () => document.visibilityState === 'visible' && now()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', now)
  const poll = setInterval(now, POLL_MS)
  const channel = client.channel('life-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'life_items' }, now).subscribe()

  return () => {
    clearTimeout(debounce)
    clearInterval(poll)
    unsubscribe()
    data.subscription.unsubscribe()
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', now)
    void client.removeChannel(channel)
  }
}
