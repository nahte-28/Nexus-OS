import { birthdayMonthDay, sortSystemMessages, type FriendBirthdayRow, type SystemMessage } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { logEvent } from '../devtools/log'
import { eventBus } from '../events/bus'
import { showLocalNotification } from '../platform/notify'
import { profilesStore } from '../profiles/store'
import { readStorage, writeStorage } from '../state/storage'
import { friendError } from './friends'

/**
 * NEXUS Verjaardagen: shares the day and month of your birthday (Over jou) with the database, so
 * NEXUS can send you "Gelukkige verjaardag" on the day and your friends see it; and shows the
 * messages NEXUS itself sent you (supabase/migrations/20261118090000_birthdays.sql).
 */

export const BIRTHDAYS_MIGRATION = 'supabase/migrations/20261118090000_birthdays.sql'
const SENT_KEY = 'nexus.birthday.sent.'
const SHOWN_KEY = 'nexus.system.shown.'
const DEBOUNCE_MS = 3000
const POLL_MS = 30 * 60_000

/** A Dutch message; 'setup:<file>' asks for the SQL. */
export function birthdaysError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/birthday|system_messages/i.test(text) && /42P01|42883|PGRST202|PGRST205|could not find the (table|function)|does not exist/i.test(text)) return `setup:${BIRTHDAYS_MIGRATION}`
  if (/not an admin|42501/i.test(text)) return 'Alleen een beheerder van NEXUS ziet alle verjaardagen.'
  return friendError(error)
}

class BirthdaysError extends Error {}
const fail = (error: { code?: string; message?: string }): never => {
  throw new BirthdaysError(birthdaysError(error))
}

interface MessageRow {
  id: string
  kind: SystemMessage['kind']
  title: string
  body: string
  about_user: string | null
  created_at: string
  read_at: string | null
}

const toMessage = (r: MessageRow): SystemMessage => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, aboutUser: r.about_user, createdAt: Date.parse(r.created_at), readAt: r.read_at ? Date.parse(r.read_at) : null })

export class Birthdays {
  constructor(private client: SupabaseClient) {}

  /** Your birthday as MM-DD, or null to forget it. */
  async publish(monthDay: string | null, shares: boolean): Promise<void> {
    const { error } = await this.client.rpc('set_birthday', { p_month_day: monthDay ?? '', p_shares: shares })
    if (error) fail(error)
  }

  /** Your friends who share their birthday. */
  async friends(): Promise<Array<FriendBirthdayRow & { user: string }>> {
    const { data, error } = await this.client.rpc('friend_birthdays')
    if (error) fail(error)
    return (Array.isArray(data) ? data : []).flatMap((r: { user?: unknown; name?: unknown; monthDay?: unknown }) =>
      typeof r.user === 'string' && typeof r.monthDay === 'string' ? [{ user: r.user, name: typeof r.name === 'string' ? r.name : 'Iemand', monthDay: r.monthDay }] : [],
    )
  }

  /** Every birthday, for Beheer. */
  async all(): Promise<FriendBirthdayRow[]> {
    const { data, error } = await this.client.rpc('admin_birthdays')
    if (error) fail(error)
    return (Array.isArray(data) ? data : []).flatMap((r: { name?: unknown; monthDay?: unknown }) => (typeof r.monthDay === 'string' ? [{ name: typeof r.name === 'string' ? r.name : 'Zonder naam', monthDay: r.monthDay }] : []))
  }

  /** Messages from NEXUS, unread first (the last 50). */
  async inbox(): Promise<SystemMessage[]> {
    const { data, error } = await this.client.from('system_messages').select('id,kind,title,body,about_user,created_at,read_at').order('created_at', { ascending: false }).limit(50)
    if (error) fail(error)
    return sortSystemMessages(((data ?? []) as MessageRow[]).map(toMessage))
  }

  async markRead(ids: string[] | null): Promise<void> {
    const { error } = await this.client.rpc('system_messages_read', { p_ids: ids })
    if (error) fail(error)
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from('system_messages').delete().eq('id', id)
    if (error) fail(error)
  }
}

// Unread messages from NEXUS, for the badge in Vrienden.
let unread = 0
const listeners = new Set<() => void>()
export function setSystemUnread(n: number): void {
  if (n === unread) return
  unread = n
  listeners.forEach((l) => l())
}
export const useSystemUnread = (): number =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => unread,
  )

/** What the database should know about your birthday, from Over jou. */
export function birthdayToShare(): { monthDay: string | null; shares: boolean } {
  const about = profilesStore.getSnapshot().state.about
  return { monthDay: birthdayMonthDay(about.birthday), shares: about.shareBirthday }
}

/**
 * While you are signed in: shares your birthday when Over jou changes, and every half hour looks
 * for new messages from NEXUS; a new one shows a notice once on this device.
 */
export function startBirthdays(client: SupabaseClient | null, enabled: () => boolean): () => void {
  if (!client) return () => {}
  const api = new Birthdays(client)
  let me: string | null = null
  let debounce: ReturnType<typeof setTimeout> | undefined
  const share = async () => {
    if (!me) return
    const want = birthdayToShare()
    const key = JSON.stringify(want)
    if (readStorage(SENT_KEY + me) === key) return
    try {
      await api.publish(want.monthDay, want.shares)
      writeStorage(SENT_KEY + me, key)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.startsWith('setup:')) logEvent('sync', `Verjaardag: ${message}`, true)
    }
  }
  const look = async () => {
    if (!me) return
    try {
      const list = await api.inbox()
      setSystemUnread(list.filter((m) => m.readAt === null).length)
      if (!enabled()) return
      const shown = new Set((readStorage(SHOWN_KEY + me) || '').split(',').filter(Boolean))
      const fresh = list.filter((m) => m.readAt === null && !shown.has(m.id) && Date.now() - m.createdAt < 2 * 86_400_000)
      for (const m of fresh) {
        const isNew = eventBus.publish({ id: `system:${m.id}`, source: 'system', type: `system.${m.kind}`, at: m.createdAt, title: m.title, link: { app: 'friends' } })
        if (isNew) await showLocalNotification(m.title, m.body, `system:${m.id}`)
        shown.add(m.id)
      }
      if (fresh.length) writeStorage(SHOWN_KEY + me, [...shown].slice(-100).join(','))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.startsWith('setup:')) logEvent('sync', `Berichten van NEXUS: ${message}`, true)
    }
  }
  const setUser = (userId: string | null) => {
    if (userId === me) return
    me = userId
    setSystemUnread(0)
    if (userId) {
      void share()
      void look()
    }
  }
  void client.auth.getSession().then(({ data }) => setUser(data.session?.user.id ?? null))
  const { data } = client.auth.onAuthStateChange((_event, session) => setUser(session?.user.id ?? null))
  const unProfiles = profilesStore.subscribe(() => {
    clearTimeout(debounce)
    debounce = setTimeout(() => void share(), DEBOUNCE_MS)
  })
  const poll = setInterval(() => void look(), POLL_MS)
  return () => {
    clearTimeout(debounce)
    clearInterval(poll)
    unProfiles()
    data.subscription.unsubscribe()
  }
}
