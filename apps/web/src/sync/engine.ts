import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { syncOnce, type Note, type RemoteStore } from '@nexus/core'
import type { NotesStore } from '../state/notesStore'

export type SyncStatus =
  | 'unconfigured' // no Supabase project connected: local-only
  | 'signed-out'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error'

export interface SyncState {
  status: SyncStatus
  email: string | null
  lastSyncedAt: number | null
  pending: number
  error: string | null
}

const CHANGE_DEBOUNCE_MS = 1500
const POLL_MS = 60_000

/**
 * Runs sync rounds whenever something could have changed: local edits, coming back online,
 * the tab becoming visible, a realtime ping from the server, or a periodic poll.
 */
export class SyncEngine {
  private state: SyncState
  private listeners = new Set<() => void>()
  private session: Session | null = null
  private running: Promise<void> | null = null
  private again = false
  private debounce: ReturnType<typeof setTimeout> | undefined
  private cleanups: Array<() => void> = []

  constructor(
    private client: SupabaseClient | null,
    private store: NotesStore,
    private remote: RemoteStore<Note> | null,
  ) {
    this.state = {
      status: client ? 'signed-out' : 'unconfigured',
      email: null,
      lastSyncedAt: null,
      pending: store.dirtyIds().length,
      error: null,
    }
  }

  start(): () => void {
    const { client } = this
    // Track how many local changes still wait for upload, also when sync is off.
    this.cleanups.push(
      this.store.subscribe(() => {
        const pending = this.store.dirtyIds().length
        this.set({ pending })
        if (pending > 0) this.schedule()
      }),
    )
    if (!client) return () => this.stop()

    void client.auth.getSession().then(({ data }) => this.setSession(data.session))
    const { data } = client.auth.onAuthStateChange((_event, session) => this.setSession(session))
    this.cleanups.push(() => data.subscription.unsubscribe())

    const onOnline = () => void this.syncNow()
    const onOffline = () => this.session && this.set({ status: 'offline' })
    const onVisible = () => document.visibilityState === 'visible' && void this.syncNow()
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    const poll = setInterval(() => void this.syncNow(), POLL_MS)
    this.cleanups.push(() => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(poll)
    })

    const channel = client
      .channel('notes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, () => void this.syncNow())
      .subscribe()
    this.cleanups.push(() => void client.removeChannel(channel))

    return () => this.stop()
  }

  private stop(): void {
    clearTimeout(this.debounce)
    for (const c of this.cleanups.splice(0)) c()
  }

  private setSession(session: Session | null): void {
    const wasSignedIn = this.session !== null
    this.session = session
    if (!session) {
      this.set({ status: 'signed-out', email: null })
      return
    }
    this.set({ email: session.user.email ?? null })
    if (!wasSignedIn) void this.syncNow()
  }

  private schedule(): void {
    if (!this.session) return
    clearTimeout(this.debounce)
    this.debounce = setTimeout(() => void this.syncNow(), CHANGE_DEBOUNCE_MS)
  }

  /** Runs a sync round; if one is already running, another follows right after it. */
  syncNow(): Promise<void> {
    if (!this.session || !this.remote) return Promise.resolve()
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.run().finally(() => {
      this.running = null
      if (this.again) {
        this.again = false
        void this.syncNow()
      }
    })
    return this.running
  }

  private async run(): Promise<void> {
    if (!navigator.onLine) {
      this.set({ status: 'offline' })
      return
    }
    this.set({ status: 'syncing', error: null })
    try {
      await this.store.ready
      await syncOnce(this.store, this.remote!)
      this.set({ status: 'synced', lastSyncedAt: Date.now(), pending: this.store.dirtyIds().length })
    } catch (err) {
      const offline = !navigator.onLine
      this.set({
        status: offline ? 'offline' : 'error',
        error: offline ? null : err instanceof Error ? err.message : String(err),
      })
    }
  }

  async signIn(email: string): Promise<void> {
    if (!this.client) throw new Error('Synchronisatie is niet ingesteld.')
    const { error } = await this.client.auth.signInWithOtp({
      email,
      // A trailing slash is needed to match redirect patterns like https://*.vercel.app/**.
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    if (error) throw error
  }

  /** Signs out and removes this device's copy; the data stays safe in the account. */
  async signOut(): Promise<void> {
    if (!this.client) return
    await this.syncNow()
    await this.client.auth.signOut()
    await this.store.reset()
    this.set({ lastSyncedAt: null })
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): SyncState => this.state

  private set(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }
}
