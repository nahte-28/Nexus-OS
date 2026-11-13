import { cleanPresenceNote, PRESENCE_PING_MS, type PresenceEntry, type PresenceState, type SeenState } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from '../devtools/log'
import { friendError } from '../friends/friends'

export const PRESENCE_MIGRATION = 'supabase/migrations/20261113210000_presence.sql'

/** A Dutch message for Wie is er online; 'setup:<file>' asks for the SQL. */
export function presenceError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/user_presence|presence_ping|set_presence|presence_list/i.test(text) && /42P01|42883|PGRST202|PGRST205|could not find the (table|function)|does not exist/i.test(text)) return `setup:${PRESENCE_MIGRATION}`
  return friendError(error)
}

class PresenceError extends Error {}
const fail = (error: { code?: string; message?: string }): never => {
  throw new PresenceError(presenceError(error))
}

export interface MyPresence {
  state: PresenceState
  note: string | null
}

/** Wie is er online on Supabase: your own row, and what friends and teammates show. */
export class Presence {
  constructor(private client: SupabaseClient) {}

  async ping(): Promise<void> {
    const { error } = await this.client.rpc('presence_ping')
    if (error) fail(error)
  }

  /** Your own status; null before you ever had NEXUS open with this step in the database. */
  async mine(): Promise<MyPresence | null> {
    const { data: session } = await this.client.auth.getSession()
    const id = session.session?.user.id
    if (!id) return null
    const { data, error } = await this.client.from('user_presence').select('state,note').eq('user_id', id).maybeSingle()
    if (error) fail(error)
    return data ? { state: (data as MyPresence).state, note: (data as MyPresence).note } : null
  }

  async set(state: PresenceState, note: string): Promise<MyPresence> {
    const clean = cleanPresenceNote(note)
    const { error } = await this.client.rpc('set_presence', { p_state: state, p_note: clean })
    if (error) fail(error)
    return { state, note: clean }
  }

  /** Your friends and the people in your teams, by user id. */
  async list(): Promise<Map<string, PresenceEntry>> {
    const { data, error } = await this.client.rpc('presence_list')
    if (error) fail(error)
    const map = new Map<string, PresenceEntry>()
    for (const r of (data ?? []) as Array<{ user_id: string; state: SeenState; note: string | null; last_seen: string | null }>) {
      map.set(r.user_id, { userId: r.user_id, state: r.state, note: r.note, lastSeen: r.last_seen ? Date.parse(r.last_seen) : null })
    }
    return map
  }
}

/**
 * Tells friends and teammates NEXUS is open: a ping every minute while this window is visible and
 * you are signed in, and right away when you come back to it.
 */
export function startPresence(client: SupabaseClient | null, enabled: () => boolean): () => void {
  if (!client || typeof document === 'undefined') return () => {}
  const presence = new Presence(client)
  let signedIn = false
  let warned = false
  const ping = () => {
    if (!signedIn || !enabled() || document.visibilityState !== 'visible') return
    presence.ping().catch((err: unknown) => {
      // Without the SQL step every ping fails the same way; say it once.
      if (warned) return
      warned = true
      logEvent('sync', `Wie is er online: ${err instanceof Error ? err.message : err}`, true)
    })
  }
  void client.auth.getSession().then(({ data }) => {
    signedIn = !!data.session
    ping()
  })
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    const was = signedIn
    signedIn = !!session
    if (signedIn && !was) ping()
  })
  const onVisible = () => ping()
  document.addEventListener('visibilitychange', onVisible)
  const timer = setInterval(ping, PRESENCE_PING_MS)
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
    data.subscription.unsubscribe()
  }
}
