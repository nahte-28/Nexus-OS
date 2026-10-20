import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { mergeFirstSync, parseProfilesState, type ProfilesState } from '@nexus/core'
import { logEvent } from '../devtools/log'
import { readStorage, writeStorage } from '../state/storage'
import { profilesStore, type ProfilesStore } from './store'

const KEY = 'profiles'
/** The account this device last synced profiles with; a new account means a first sync. */
const SYNCED_USER_KEY = 'nexus.profiles.synced-user'
const PUSH_DEBOUNCE_MS = 1500
const POLL_MS = 5 * 60_000

/** Where the account's copy lives; a small seam so the logic can be tested without Supabase. */
export interface ProfilesRemote {
  pull(): Promise<ProfilesState | null>
  /** False when the account already has a copy that is as new or newer. */
  push(state: ProfilesState): Promise<boolean>
}

export function createProfilesRemote(client: SupabaseClient): ProfilesRemote {
  return {
    async pull() {
      const { data, error } = await client.from('user_settings').select('value,revision').eq('key', KEY).maybeSingle()
      if (error) throw error
      if (!data) return null
      return { ...parseProfilesState(data.value), revision: Number(data.revision) }
    },
    async push(state) {
      const { data, error } = await client
        .from('user_settings')
        .upsert({ key: KEY, value: state, revision: state.revision }, { onConflict: 'user_id,key' })
        .select('revision')
      if (error) throw error
      // The server skips a copy that is not newer, and then returns no row.
      return (data ?? []).length > 0
    },
  }
}

/**
 * Keeps NEXUS Profiles (and the calendar link) the same on every device of the account.
 * The copy with the higher revision wins; the first sync of a device merges, see mergeFirstSync.
 */
export class ProfilesSync {
  private pushedRevision = -1
  private running: Promise<void> | null = null
  private again = false

  constructor(
    private remote: ProfilesRemote,
    private store: ProfilesStore = profilesStore,
    private userId: string,
  ) {}

  /** One round: compare with the account's copy and move whichever side is behind. */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.round()
      .catch((err) => logEvent('sync', `Profielen synchroniseren mislukt: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => {
        this.running = null
        if (this.again) {
          this.again = false
          void this.sync()
        }
      })
    return this.running
  }

  private async round(): Promise<void> {
    const local = this.store.getSnapshot().state
    const remote = await this.remote.pull()
    const first = readStorage(SYNCED_USER_KEY) !== this.userId
    if (!remote) {
      await this.push(local)
    } else if (first) {
      const merged = mergeFirstSync(local, remote)
      if (merged !== local) this.store.adopt(merged)
      if (merged !== remote) await this.push(merged)
    } else if (remote.revision > local.revision) {
      this.store.adopt(remote)
    } else if (local.revision > remote.revision) {
      await this.push(local)
    } else if (JSON.stringify(remote) !== JSON.stringify(local)) {
      // Two devices made a change at the same revision: the one the account kept counts.
      this.store.adopt(remote)
    }
    writeStorage(SYNCED_USER_KEY, this.userId)
    this.pushedRevision = this.store.getSnapshot().state.revision
  }

  private async push(state: ProfilesState): Promise<void> {
    if (await this.remote.push(state)) return
    // Another device got there first with the same revision: its copy is the one that counts.
    const winner = await this.remote.pull()
    if (winner) this.store.adopt(winner)
  }

  /** True when this device has a change the account has not seen yet. */
  hasLocalChange(): boolean {
    return this.store.getSnapshot().state.revision > this.pushedRevision
  }
}

/** Starts syncing profiles whenever someone is signed in; stays local-only otherwise. */
export function startProfilesSync(client: SupabaseClient | null, store: ProfilesStore = profilesStore): () => void {
  if (!client) return () => {}
  let sync: ProfilesSync | null = null
  let debounce: ReturnType<typeof setTimeout> | undefined
  const remote = createProfilesRemote(client)

  const setSession = (session: Session | null) => {
    if (!session) {
      sync = null
      return
    }
    if (sync && readStorage(SYNCED_USER_KEY) === session.user.id) return
    sync = new ProfilesSync(remote, store, session.user.id)
    void sync.sync()
  }
  void client.auth.getSession().then(({ data }) => setSession(data.session))
  const { data } = client.auth.onAuthStateChange((_event, session) => setSession(session))

  const unsubscribe = store.subscribe(() => {
    if (!sync?.hasLocalChange()) return
    clearTimeout(debounce)
    debounce = setTimeout(() => void sync?.sync(), PUSH_DEBOUNCE_MS)
  })
  const now = () => void sync?.sync()
  const onVisible = () => document.visibilityState === 'visible' && now()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', now)
  const poll = setInterval(now, POLL_MS)
  const channel = client
    .channel('settings-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_settings' }, now)
    .subscribe()

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
