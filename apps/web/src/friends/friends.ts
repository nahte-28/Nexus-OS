import { FRIEND_NAME_MAX, friendCodeFromPath, friendLink, normalizeFriendCode, type FriendEntry, type FriendKind } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from '../devtools/log'
import { eventBus } from '../events/bus'
import { setFeature } from '../features/store'
import { apiBase, isDesktopApp } from '../platform/desktop'
import { showLocalNotification } from '../platform/notify'
import { openApp } from '../shell/openApp'
import { readStorage, writeStorage } from '../state/storage'
import { teamError } from '../teams/teams'

export const FRIENDS_MIGRATION = 'supabase/migrations/20261113150000_friends.sql'
const PENDING_KEY = 'nexus.friends.add'

/** A Dutch message for Vrienden; 'setup:<file>' asks for the SQL. */
export function friendError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/friend_profiles|friendships|set_friend_profile|request_friend|list_friends|accept_friend|renew_friend_code/i.test(text) && /42P01|42883|PGRST202|PGRST205|could not find the (table|function)|does not exist/i.test(text)) return `setup:${FRIENDS_MIGRATION}`
  if (/own friend code/i.test(text)) return 'Dat is je eigen code.'
  if (/no friend profile/i.test(text)) return 'Kies eerst je naam voor vrienden.'
  if (/name required/i.test(text)) return 'Vul een naam in.'
  if (/too many friend requests/i.test(text)) return 'Je hebt al 50 verzoeken openstaan. Wacht tot ze aanvaard zijn of trek er een paar in.'
  if (/too many friends/i.test(text)) return 'Je hebt het maximum van 300 vrienden en verzoeken.'
  if (/no friend request/i.test(text)) return 'Dat verzoek bestaat niet meer.'
  return teamError(error)
}

class FriendError extends Error {}
const fail = (error: { code?: string; message?: string }): never => {
  throw new FriendError(friendError(error))
}

interface ProfileRow {
  user_id: string
  display_name: string
  code: string
}
interface FriendRow {
  user_id: string
  display_name: string
  kind: FriendKind
  since: string
}

export interface FriendProfile {
  displayName: string
  code: string
}

/** Vrienden on Supabase. Names and codes only go through the SQL functions. */
export class Friends {
  constructor(private client: SupabaseClient) {}

  async me(): Promise<{ id: string; email: string | undefined } | null> {
    const { data } = await this.client.auth.getSession()
    const user = data.session?.user
    return user ? { id: user.id, email: user.email } : null
  }

  /** Your name and code, or null before you chose a name. */
  async profile(): Promise<FriendProfile | null> {
    const { data, error } = await this.client.from('friend_profiles').select('user_id,display_name,code').maybeSingle()
    if (error) fail(error)
    const row = data as ProfileRow | null
    return row ? { displayName: row.display_name, code: row.code } : null
  }

  async setName(name: string): Promise<FriendProfile> {
    const { data, error } = await this.client.rpc('set_friend_profile', { p_display_name: name.trim().slice(0, FRIEND_NAME_MAX) })
    if (error) fail(error)
    const row = data as ProfileRow
    return { displayName: row.display_name, code: row.code }
  }

  async renewCode(): Promise<FriendProfile> {
    const { data, error } = await this.client.rpc('renew_friend_code')
    if (error) fail(error)
    const row = data as ProfileRow
    return { displayName: row.display_name, code: row.code }
  }

  async list(): Promise<FriendEntry[]> {
    const { data, error } = await this.client.rpc('list_friends')
    if (error) fail(error)
    return ((data ?? []) as FriendRow[]).map((r) => ({ userId: r.user_id, displayName: r.display_name, kind: r.kind, since: Date.parse(r.since) }))
  }

  /** Null when no one has this code. */
  async add(code: string): Promise<{ status: 'pending' | 'accepted' | 'already'; name: string } | null> {
    const normalized = normalizeFriendCode(code)
    if (!normalized) throw new FriendError('Een vriendencode heeft 8 letters en cijfers, bv. ABCD-EFGH.')
    const { data, error } = await this.client.rpc('request_friend', { p_code: normalized })
    if (error) fail(error)
    const row = ((data ?? []) as Array<{ status: 'pending' | 'accepted' | 'already'; display_name: string }>)[0]
    return row ? { status: row.status, name: row.display_name } : null
  }

  async accept(userId: string): Promise<void> {
    const { error } = await this.client.rpc('accept_friend', { p_requester: userId })
    if (error) fail(error)
  }

  /** Ends a friendship, declines a request or takes back your own; works from both sides. */
  async remove(me: string, userId: string): Promise<void> {
    const { error } = await this.client.from('friendships').delete().or(`and(requester.eq.${me},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${me})`)
    if (error) fail(error)
  }

  /** Calls [onChange] when one of your friendships changes; returns the way to stop listening. */
  watch(onChange: (row: { requester?: string; addressee?: string; status?: string } | null) => void): () => void {
    const channel = this.client.channel(`friends-${Math.random().toString(36).slice(2)}`)
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, (payload: { new?: { requester?: string; addressee?: string; status?: string } }) => onChange(payload.new ?? null))
    channel.subscribe()
    return () => void this.client.removeChannel(channel)
  }
}

/** Where your friend link points: the live NEXUS, also from the Windows app. */
export function myFriendLink(code: string): string {
  return friendLink(isDesktopApp ? apiBase : window.location.origin, code)
}

export const pendingFriend = (): string | null => readStorage(PENDING_KEY) || null
export const clearPendingFriend = (): void => writeStorage(PENDING_KEY, '')

/** NEXUS was opened with a friend link (/vriend/ABCD-EFGH): keeps the code and opens Vrienden. */
export function openFriendFromUrl(location: Pick<Location, 'pathname' | 'hash'> = window.location): boolean {
  const code = friendCodeFromPath(location.pathname)
  if (!code) return false
  writeStorage(PENDING_KEY, code)
  setFeature('friends', true)
  history.replaceState(history.state, '', `/${location.hash}`)
  let tries = 40
  const open = () => {
    if (!openApp('friends') && --tries > 0) setTimeout(open, 250)
  }
  open()
  return true
}

/** A notice when someone sends you a friend request or accepts yours, while NEXUS runs. */
export function startFriendNotices(client: SupabaseClient | null, enabled: () => boolean): () => void {
  if (!client) return () => {}
  const friends = new Friends(client)
  let me: string | null = null
  let stop: (() => void) | null = null
  const onChange = async (row: { requester?: string; addressee?: string; status?: string } | null) => {
    if (!enabled() || !me || !row?.requester || !row.addressee) return
    const incoming = row.status === 'pending' && row.addressee === me
    const accepted = row.status === 'accepted' && row.requester === me
    if (!incoming && !accepted) return
    try {
      const other = incoming ? row.requester : row.addressee
      const name = (await friends.list()).find((f) => f.userId === other)?.displayName ?? 'Iemand'
      const title = incoming ? `${name} wil je vriend worden` : `${name} aanvaardde je vriendschapsverzoek`
      const fresh = eventBus.publish({ id: `friend:${incoming ? 'request' : 'accepted'}:${other}`, source: 'study_group', type: incoming ? 'friend.request' : 'friend.accepted', at: Date.now(), title, link: { app: 'friends' } })
      if (fresh) await showLocalNotification(title, incoming ? 'Open Vrienden om het verzoek te aanvaarden.' : 'Jullie zijn nu vrienden in NEXUS.', `friend:${other}`)
    } catch (err) {
      logEvent('sync', `Vrienden: melding lukte niet: ${err instanceof Error ? err.message : err}`, true)
    }
  }
  const listen = (userId: string | null) => {
    me = userId
    stop?.()
    stop = userId ? friends.watch((row) => void onChange(row)) : null
  }
  void client.auth.getSession().then(({ data }) => listen(data.session?.user.id ?? null))
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    if ((session?.user.id ?? null) !== me) listen(session?.user.id ?? null)
  })
  return () => {
    stop?.()
    data.subscription.unsubscribe()
  }
}
