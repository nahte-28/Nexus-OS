import { parseShares, planOwnerSync, sharedWithMe, type NoteShare, type ShareSeen } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { logEvent } from '../devtools/log'
import { eventBus } from '../events/bus'
import { friendError } from '../friends/friends'
import { showLocalNotification } from '../platform/notify'
import { readStorage, writeStorage } from '../state/storage'
import { notesStore, type NotesStore } from '../state/notesStore'

export const SHARES_MIGRATION = 'supabase/migrations/20261116210000_note_shares.sql'

/** A Dutch message for Notities delen; 'setup:<file>' asks for the SQL. */
export function shareError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/note_share/i.test(text) && /42P01|42883|PGRST202|PGRST205|could not find the (table|function)|does not exist/i.test(text)) return `setup:${SHARES_MIGRATION}`
  if (/intussen veranderd|40001/i.test(text)) return 'Iemand anders bewaarde deze notitie intussen. Je ziet nu de nieuwste versie.'
  if (/alleen met een vriend/i.test(text)) return 'Je kunt alleen met een vriend delen.'
  if (/team waar je in zit/i.test(text)) return 'Je kunt alleen delen met een team waar je in zit.'
  if (/hoogstens 50/i.test(text)) return 'Je kunt een notitie met hoogstens 50 vrienden of teams delen.'
  if (/al 100/i.test(text)) return 'Je deelt al 100 notities. Stop eerst met een andere te delen.'
  if (/te lang/i.test(text)) return 'Deze notitie is te lang om te delen (hoogstens 100.000 tekens).'
  if (/niet bewerken/i.test(text)) return 'Je mag deze notitie alleen lezen.'
  if (/niet \(meer\)/i.test(text)) return 'Deze gedeelde notitie is er niet meer.'
  return friendError(error)
}

class ShareError extends Error {
  constructor(
    message: string,
    readonly stale = false,
  ) {
    super(message)
  }
}
const fail = (error: { code?: string; message?: string }): never => {
  throw new ShareError(shareError(error), /40001|intussen veranderd/i.test(`${error.code ?? ''} ${error.message ?? ''}`))
}
export const isStale = (err: unknown) => err instanceof ShareError && err.stale

/** Notities delen on Supabase: everything goes through the SQL functions. */
export class NoteShares {
  constructor(private client: SupabaseClient) {}

  async list(): Promise<NoteShare[]> {
    const { data, error } = await this.client.rpc('note_shares_list')
    if (error) fail(error)
    return parseShares(data)
  }

  async create(noteId: string, title: string, body: string): Promise<string> {
    const { data, error } = await this.client.rpc('note_share_create', { p_note: noteId, p_title: title, p_body: body })
    if (error) fail(error)
    return String(data)
  }

  async grant(share: string, to: { user?: string; group?: string }, canEdit: boolean): Promise<void> {
    const { error } = await this.client.rpc('note_share_grant', { p_share: share, p_user: to.user ?? null, p_group: to.group ?? null, p_edit: canEdit })
    if (error) fail(error)
  }

  async revoke(share: string, to: { user?: string | null; group?: string | null }): Promise<void> {
    const { error } = await this.client.rpc('note_share_revoke', { p_share: share, p_user: to.user ?? null, p_group: to.group ?? null })
    if (error) fail(error)
  }

  /** Saves on top of [revision]; a stale revision throws an error for which isStale() is true. */
  async save(share: string, revision: number, title: string, body: string): Promise<number> {
    const { data, error } = await this.client.rpc('note_share_save', { p_share: share, p_revision: revision, p_title: title, p_body: body })
    if (error) fail(error)
    return Number(data)
  }

  async remove(share: string): Promise<void> {
    const { error } = await this.client.rpc('note_share_delete', { p_share: share })
    if (error) fail(error)
  }

  watch(onChange: () => void): () => void {
    const channel = this.client.channel(`note-shares-${Math.random().toString(36).slice(2)}`)
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'note_shares' }, () => onChange())
    channel.subscribe()
    return () => void this.client.removeChannel(channel)
  }
}

export type SharesApi = Pick<NoteShares, 'list' | 'create' | 'grant' | 'revoke' | 'save' | 'remove'>

interface SharesState {
  /** null until the first list, or without an account. */
  shares: NoteShare[] | null
  error: string | null
}
let state: SharesState = { shares: null, error: null }
const listeners = new Set<() => void>()
const set = (next: SharesState) => {
  state = next
  for (const l of listeners) l()
}
export const sharesStore = {
  getSnapshot: () => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
export const useShares = () => useSyncExternalStore(sharesStore.subscribe, sharesStore.getSnapshot)
/** For tests. */
export const setSharesState = (next: Partial<SharesState>) => set({ ...state, ...next })

let active: { api: SharesApi; refresh: () => Promise<void> } | null = null
/** The connection while signed in, for the buttons in Notities. */
export const sharesApi = () => active
/** For tests. */
export const setSharesApi = (next: typeof active) => {
  active = next
}

const SEEN_KEY = 'nexus.noteshares.seen'
function readSeen(): Record<string, ShareSeen> {
  try {
    const raw = JSON.parse(readStorage(SEEN_KEY) || '{}') as Record<string, ShareSeen>
    return typeof raw === 'object' && raw ? raw : {}
  } catch {
    return {}
  }
}

/** The shares with you that already gave a notice. */
const noticed = new Set<string>()

/** One round: lists your shares, keeps your shared notes and their copies in line. */
export async function syncShares(api: SharesApi, notes: NotesStore = notesStore, now = Date.now(), notify = true): Promise<NoteShare[]> {
  await notes.ready
  let shares = await api.list()
  const plan = planOwnerSync(shares, notes.all(), readSeen(), now)
  for (const p of plan.pull) notes.update(p.note, { title: p.title, body: p.body })
  let changed = plan.stop.length > 0
  for (const p of plan.push) {
    try {
      await api.save(p.share, p.revision, p.title, p.body)
      changed = true
    } catch (err) {
      // Someone saved at the same moment: the next round sorts it out.
      if (!isStale(err)) throw err
    }
  }
  for (const id of plan.stop) await api.remove(id)
  if (changed) shares = await api.list()
  // After pulling, your note and the share are the same: remember that.
  const after = planOwnerSync(shares, notes.all(), { ...readSeen(), ...plan.seen }, now)
  writeStorage(SEEN_KEY, JSON.stringify(after.seen))

  for (const s of sharedWithMe(shares)) {
    if (noticed.has(s.id)) continue
    noticed.add(s.id)
    if (!notify) continue
    const title = `${s.ownerName} deelde een notitie met je`
    const fresh = eventBus.publish({ id: `noteshare:${s.id}`, source: 'study_group', type: 'note.shared', at: now, title, link: { app: 'notes' } })
    if (fresh) await showLocalNotification(title, s.title || 'Open Notities › Gedeeld met mij.', `noteshare:${s.id}`)
  }
  set({ shares, error: null })
  return shares
}

const POLL_MS = 15 * 60_000
const DEBOUNCE_MS = 2000

/**
 * Keeps shared notes up to date while NEXUS runs, with an account and Vrienden or Teams on: live
 * when a shared note changes, soon after you type in a note you shared, and every 15 minutes.
 */
export function startNoteShares(client: SupabaseClient | null, enabled: () => boolean, notes: NotesStore = notesStore): () => void {
  if (!client) return () => {}
  const api = new NoteShares(client)
  let signedIn = false
  let first = true
  let running = false
  let again = false
  let debounce: ReturnType<typeof setTimeout> | undefined
  let stopWatch: (() => void) | null = null
  const run = async (): Promise<void> => {
    if (!signedIn || !enabled()) return
    if (running) {
      again = true
      return
    }
    running = true
    try {
      await syncShares(api, notes, Date.now(), !first)
      first = false
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ ...state, error: message })
      if (!message.startsWith('setup:')) logEvent('sync', `Notities delen: ${message}`, true)
    } finally {
      running = false
      if (again) {
        again = false
        void run()
      }
    }
  }
  const soon = () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => void run(), DEBOUNCE_MS)
  }
  const setSession = (on: boolean) => {
    if (on === signedIn) return
    signedIn = on
    stopWatch?.()
    stopWatch = null
    if (on) {
      active = { api, refresh: run }
      stopWatch = api.watch(soon)
      void run()
    } else {
      active = null
      first = true
      noticed.clear()
      writeStorage(SEEN_KEY, '{}')
      set({ shares: null, error: null })
    }
  }
  void client.auth.getSession().then(({ data }) => setSession(Boolean(data.session)))
  const { data } = client.auth.onAuthStateChange((_event, session) => setSession(Boolean(session)))
  // Only notes you shared matter; the plan finds them, other notes change nothing.
  const unNotes = notes.subscribe(() => {
    if (state.shares?.some((s) => s.right === 'owner')) soon()
  })
  const poll = setInterval(() => void run(), POLL_MS)
  return () => {
    clearTimeout(debounce)
    clearInterval(poll)
    unNotes()
    stopWatch?.()
    data.subscription.unsubscribe()
  }
}
