import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { parseStorageName, storageName, type FileMeta } from '@nexus/core'
import { logEvent } from '../devtools/log'
import { filesStore, type FilesStore } from './store'

export const FILES_BUCKET = 'nexus-files'
const PAGE_SIZE = 1000
const DEBOUNCE_MS = 1500
const POLL_MS = 2 * 60_000

/** Your private storage: one object per file under your user id. */
export interface FilesRemote {
  list(): Promise<FileMeta[]>
  upload(file: FileMeta, data: Blob): Promise<void>
  download(file: FileMeta): Promise<Blob>
  remove(file: FileMeta): Promise<void>
}

export function createFilesRemote(client: SupabaseClient, userId: string): FilesRemote {
  const bucket = () => client.storage.from(FILES_BUCKET)
  const path = (f: FileMeta) => `${userId}/${storageName(f.id, f.name)}`
  return {
    async list() {
      const out: FileMeta[] = []
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await bucket().list(userId, { limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } })
        if (error) throw error
        for (const object of data ?? []) {
          const parsed = parseStorageName(object.name)
          if (!parsed) continue
          const meta = (object.metadata ?? {}) as { size?: number; mimetype?: string }
          out.push({ ...parsed, size: meta.size ?? 0, mediaType: meta.mimetype ?? 'application/octet-stream', addedAt: Date.parse(object.created_at ?? '') || Date.now() })
        }
        if ((data ?? []).length < PAGE_SIZE) return out
      }
    },
    async upload(file, data) {
      const { error } = await bucket().upload(path(file), data, { contentType: file.mediaType, upsert: true })
      if (error) throw error
    },
    async download(file) {
      const { data, error } = await bucket().download(path(file))
      if (error || !data) throw error ?? new Error('Downloaden mislukt.')
      return data
    },
    async remove(file) {
      const { error } = await bucket().remove([path(file)])
      if (error) throw error
    },
  }
}

/**
 * One round: removes what you deleted here, uploads what is new here, and takes over what
 * changed on your other devices. A file is never changed in place, so there are no conflicts.
 */
export async function syncFiles(store: FilesStore, remote: FilesRemote): Promise<{ uploaded: number; removed: number; received: number }> {
  await store.ready
  const local = store.all()
  const deleted = local.filter((f) => f.deletedAt !== null)
  for (const f of deleted) await remote.remove(f)
  await store.forget(deleted.map((f) => f.id))

  const uploaded: string[] = []
  for (const f of local) {
    if (f.remote || f.deletedAt !== null || !f.data) continue
    await remote.upload(f, new Blob([f.data], { type: f.mediaType }))
    uploaded.push(f.id)
  }
  await store.markRemote(uploaded)

  const inAccount = await remote.list()
  const ids = new Set(inAccount.map((f) => f.id))
  const known = new Set(store.all().map((f) => f.id))
  const added = inAccount.filter((f) => !known.has(f.id))
  // Uploaded by this device but gone from the account: deleted on another device.
  const gone = store
    .all()
    .filter((f) => f.remote && f.deletedAt === null && !ids.has(f.id))
    .map((f) => f.id)
  await store.applyRemote(added, gone)
  return { uploaded: uploaded.length, removed: deleted.length, received: added.length }
}

/** Shown in Bestanden when the account's storage is not set up yet, or another problem. */
export const filesSyncProblem = {
  value: null as string | null,
  listeners: new Set<() => void>(),
  set(value: string | null) {
    if (value === this.value) return
    this.value = value
    this.listeners.forEach((l) => l())
  },
  subscribe: (l: () => void) => {
    filesSyncProblem.listeners.add(l)
    return () => filesSyncProblem.listeners.delete(l)
  },
  getSnapshot: () => filesSyncProblem.value,
}

function problemText(err: unknown): string {
  const message = (err as { message?: string })?.message ?? String(err)
  return /bucket not found/i.test(message) ? 'setup' : message
}

/** Keeps your files in your account whenever someone is signed in. */
export function startFilesSync(client: SupabaseClient | null, store: FilesStore = filesStore): () => void {
  if (!client) return () => {}
  let session: Session | null = null
  let remote: FilesRemote | null = null
  let running: Promise<void> | null = null
  let again = false
  let debounce: ReturnType<typeof setTimeout> | undefined

  const sync = (): Promise<void> => {
    if (!remote || !navigator.onLine) return Promise.resolve()
    if (running) {
      again = true
      return running
    }
    const current = remote
    running = (async () => {
      try {
        const report = await syncFiles(store, current)
        filesSyncProblem.set(null)
        if (report.uploaded || report.removed || report.received) {
          logEvent('sync', `Bestanden: ${report.uploaded} geüpload, ${report.removed} verwijderd, ${report.received} binnengehaald`)
        }
      } catch (err) {
        filesSyncProblem.set(problemText(err))
        logEvent('sync', `Bestanden synchroniseren mislukt: ${problemText(err)}`, true)
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
      remote = null
      store.download = null
      if (before) store.reset()
      return
    }
    if (!before || before.user.id !== next.user.id) {
      remote = createFilesRemote(client, next.user.id)
      store.download = (file) => createFilesRemote(client, next.user.id).download(file)
      void sync()
    }
  }
  void client.auth.getSession().then(({ data }) => setSession(data.session))
  const { data } = client.auth.onAuthStateChange((_event, s) => setSession(s))

  const unsubscribe = store.subscribe(() => {
    clearTimeout(debounce)
    debounce = setTimeout(() => void sync(), DEBOUNCE_MS)
  })
  const now = () => void sync()
  const onVisible = () => document.visibilityState === 'visible' && now()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', now)
  const poll = setInterval(now, POLL_MS)

  return () => {
    clearTimeout(debounce)
    clearInterval(poll)
    unsubscribe()
    data.subscription.unsubscribe()
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', now)
  }
}
