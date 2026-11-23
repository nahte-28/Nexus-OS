import type { SupabaseClient } from '@supabase/supabase-js'
import { chatReadAt } from '../teams/chat'
import { UNREAD_EVENT as EVENT } from './events'

const CHECK_MS = 2 * 60_000
const SETTLE_MS = 1_500
/** A team chat you never opened on this device counts only its last week, not its whole history. */
export const UNREAD_WINDOW_MS = 7 * 24 * 60 * 60_000

/** Where the counts come from; Supabase in the app, a fake in tests. */
export interface UnreadSource {
  /** Privéberichten to you that you have not read yet. */
  dms(me: string): Promise<number>
  /** The teams you are in. */
  teams(me: string): Promise<string[]>
  /** Messages of others in one team after [since]. */
  teamSince(groupId: string, me: string, since: number): Promise<number>
}

export interface UnreadParts {
  teams: boolean
  dms: boolean
}

/** Unread teamchat and privéberichten together; a part that fails (no SQL yet, offline) counts 0. */
export async function countUnread(source: UnreadSource, me: string, parts: UnreadParts, now = Date.now(), readAt: (groupId: string) => number = chatReadAt): Promise<number> {
  const dms = parts.dms ? source.dms(me).catch(() => 0) : Promise.resolve(0)
  const teams = parts.teams
    ? source
        .teams(me)
        .then((ids) => Promise.all(ids.map((id) => source.teamSince(id, me, Math.max(readAt(id), now - UNREAD_WINDOW_MS)).catch(() => 0))))
        .then((counts) => counts.reduce((a, b) => a + b, 0))
        .catch(() => 0)
    : Promise.resolve(0)
  const [d, t] = await Promise.all([dms, teams])
  return d + t
}

export function supabaseUnreadSource(client: SupabaseClient): UnreadSource {
  return {
    async dms(me) {
      const { count, error } = await client.from('dm_messages').select('id', { count: 'exact', head: true }).eq('recipient', me).is('read_at', null)
      if (error) throw error
      return count ?? 0
    },
    async teams(me) {
      const { data, error } = await client.from('study_group_members').select('group_id').eq('user_id', me)
      if (error) throw error
      return ((data ?? []) as Array<{ group_id: string }>).map((r) => r.group_id)
    },
    async teamSince(groupId, me, since) {
      const { count, error } = await client
        .from('team_messages')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .neq('user_id', me)
        .gt('created_at', new Date(since).toISOString())
      if (error) throw error
      return count ?? 0
    },
  }
}

interface BadgeNavigator {
  setAppBadge?: (n?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

/** Shows [n] on the NEXUS icon (taskbar, dock or home screen) where the system supports it. */
export async function showBadge(n: number, nav: BadgeNavigator | undefined = typeof navigator !== 'undefined' ? (navigator as BadgeNavigator) : undefined): Promise<boolean> {
  if (!nav?.setAppBadge) return false
  try {
    if (n > 0) await nav.setAppBadge(n)
    else if (nav.clearAppBadge) await nav.clearAppBadge()
    else await nav.setAppBadge(0)
    return true
  } catch {
    return false
  }
}

/**
 * The number of unread teamchat and privéberichten on the NEXUS icon, while NEXUS runs and you
 * are signed in. Counts again every two minutes, when you come back to NEXUS, and after a
 * message comes in or is read.
 */
export function startAppBadge(client: SupabaseClient | null, parts: () => UnreadParts): () => void {
  if (!client || typeof window === 'undefined' || !(navigator as BadgeNavigator).setAppBadge) return () => {}
  const source = supabaseUnreadSource(client)
  let me: string | null = null
  let settle: ReturnType<typeof setTimeout> | undefined
  let last = -1
  const tick = async () => {
    const which = parts()
    let n = 0
    if (me && (which.teams || which.dms)) {
      // Offline the count cannot change from here: keep what the icon shows.
      if (navigator.onLine === false) return
      n = await countUnread(source, me, which)
    }
    if (n === last) return
    last = n
    await showBadge(n)
  }
  const soon = () => {
    clearTimeout(settle)
    settle = setTimeout(() => void tick(), SETTLE_MS)
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') soon()
  }
  const timer = setInterval(() => void tick(), CHECK_MS)
  window.addEventListener(EVENT, soon)
  window.addEventListener('online', soon)
  document.addEventListener('visibilitychange', onVisible)
  void client.auth.getSession().then(({ data }) => {
    me = data.session?.user.id ?? null
    void tick()
  })
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    if ((session?.user.id ?? null) === me) return
    me = session?.user.id ?? null
    soon()
  })
  return () => {
    clearInterval(timer)
    clearTimeout(settle)
    window.removeEventListener(EVENT, soon)
    window.removeEventListener('online', soon)
    document.removeEventListener('visibilitychange', onVisible)
    data.subscription.unsubscribe()
  }
}
