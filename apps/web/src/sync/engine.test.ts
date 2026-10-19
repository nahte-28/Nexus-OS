import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Note, PullResult, RemoteStore } from '@nexus/core'
import { resetDbConnection } from '../state/db'
import { NotesStore } from '../state/notesStore'
import { authErrorText, SyncEngine } from './engine'

class FakeServer implements RemoteStore<Note> {
  rows = new Map<string, Note>()
  online = true
  async push(notes: Note[]) {
    if (!this.online) throw new Error('Failed to fetch')
    for (const n of notes) {
      const old = this.rows.get(n.id)
      if (!old || old.updatedAt <= n.updatedAt) this.rows.set(n.id, { ...n })
    }
  }
  async pull(): Promise<PullResult<Note>> {
    if (!this.online) throw new Error('Failed to fetch')
    return { records: [...this.rows.values()].map((n) => ({ ...n })), cursor: 'c' }
  }
}

function fakeClient(signedIn: boolean) {
  const session = signedIn ? { user: { email: 'ethan@example.com' } } : null
  const channel = { on: () => channel, subscribe: () => channel }
  return {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: vi.fn(async () => ({ error: null })),
    },
    channel: () => channel,
    removeChannel: async () => {},
  } as unknown as SupabaseClient
}

async function settle(engine: SyncEngine) {
  await vi.waitFor(() => expect(['synced', 'offline', 'error']).toContain(engine.getSnapshot().status))
}

describe('SyncEngine', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    resetDbConnection()
    localStorage.clear()
  })

  it('stays local-only when Supabase is not configured', async () => {
    const store = new NotesStore()
    const engine = new SyncEngine(null, store, null)
    const stop = engine.start()
    await store.ready
    store.add()
    expect(engine.getSnapshot().status).toBe('unconfigured')
    expect(engine.getSnapshot().pending).toBe(1)
    stop()
  })

  it('uploads queued notes after sign-in and syncs them to a second device', async () => {
    const server = new FakeServer()
    const pc = new NotesStore()
    await pc.ready
    const id = pc.add()
    pc.update(id, { body: 'van pc' })

    const engine = new SyncEngine(fakeClient(true), pc, server)
    const stop = engine.start()
    await settle(engine)
    expect(engine.getSnapshot()).toMatchObject({ status: 'synced', pending: 0, email: 'ethan@example.com' })
    expect(server.rows.get(id)?.body).toBe('van pc')
    stop()

    // A second device with its own database.
    globalThis.indexedDB = new IDBFactory()
    resetDbConnection()
    const phone = new NotesStore()
    const phoneEngine = new SyncEngine(fakeClient(true), phone, server)
    const stopPhone = phoneEngine.start()
    await settle(phoneEngine)
    expect(phone.getSnapshot().map((n) => n.body)).toEqual(['van pc'])
    stopPhone()
  })

  it('keeps changes queued while offline and sends them once back online', async () => {
    const server = new FakeServer()
    server.online = false
    const store = new NotesStore()
    await store.ready
    const engine = new SyncEngine(fakeClient(true), store, server)
    const stop = engine.start()
    await settle(engine)
    store.add()
    await engine.syncNow()
    expect(engine.getSnapshot().status).toBe('error')
    expect(engine.getSnapshot().pending).toBe(1)

    server.online = true
    await engine.syncNow()
    expect(engine.getSnapshot()).toMatchObject({ status: 'synced', pending: 0 })
    expect(server.rows.size).toBe(1)
    stop()
  })

  it('wipes the device copy on sign-out after a final sync', async () => {
    const server = new FakeServer()
    const store = new NotesStore()
    await store.ready
    store.add()
    const client = fakeClient(true)
    const engine = new SyncEngine(client, store, server)
    const stop = engine.start()
    await settle(engine)
    await engine.signOut()
    expect(client.auth.signOut).toHaveBeenCalled()
    expect(store.getSnapshot()).toEqual([])
    expect(server.rows.size).toBe(1)
    stop()
  })
})

describe('password sign-in', () => {
  it('translates Supabase auth errors to Dutch', () => {
    expect(authErrorText('Invalid login credentials')).toBe('E-mailadres of wachtwoord klopt niet.')
    expect(authErrorText('email rate limit exceeded')).toMatch(/te veel mails/)
    expect(authErrorText('Password should be at least 6 characters.')).toBe('Je wachtwoord moet minstens 6 tekens lang zijn.')
    expect(authErrorText('Something new')).toBe('Something new')
  })

  it('signs up, signs in and reports existing accounts', async () => {
    const auth = {
      signUp: vi.fn(async ({ email }: { email: string }) =>
        email === 'bestaat@example.com'
          ? { data: { user: { identities: [] }, session: null }, error: null }
          : { data: { user: { identities: [{}] }, session: null }, error: null },
      ),
      signInWithPassword: vi.fn(async ({ password }: { password: string }) => ({
        data: {},
        error: password === 'goed' ? null : { message: 'Invalid login credentials' },
      })),
    }
    const engine = new SyncEngine({ auth } as unknown as SupabaseClient, new NotesStore(), new FakeServer())
    await expect(engine.signUp('nieuw@example.com', 'geheim1')).resolves.toEqual({ needsConfirmation: true })
    await expect(engine.signUp('bestaat@example.com', 'geheim1')).rejects.toThrow(/bestaat al/)
    await expect(engine.signInWithPassword('a@example.com', 'fout')).rejects.toThrow('E-mailadres of wachtwoord klopt niet.')
    await expect(engine.signInWithPassword('a@example.com', 'goed')).resolves.toBeUndefined()
  })
})
