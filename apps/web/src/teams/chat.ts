import { chatNotice, cleanMessage, TEAM_CHAT_PAGE, type TeamMessage } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from '../devtools/log'
import { eventBus } from '../events/bus'
import { showLocalNotification } from '../platform/notify'
import { readStorage, writeStorage } from '../state/storage'
import { teamError } from './teams'

export const TEAM_CHAT_MIGRATION = 'supabase/migrations/20261113090000_team_chat.sql'
const READ_KEY = 'nexus.teams.chatRead'

/** A Dutch message for Teams › Chat; 'setup:<file>' asks for the SQL. */
export function chatError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/team_messages/i.test(text) && /42P01|PGRST205|could not find the table|does not exist/i.test(text)) return `setup:${TEAM_CHAT_MIGRATION}`
  if (/too many messages/i.test(text)) return 'Even rustig: je stuurde net veel berichten. Probeer het over een minuut opnieuw.'
  return teamError(error)
}

class ChatError extends Error {}
const fail = (error: { code?: string; message?: string }): never => {
  throw new ChatError(chatError(error))
}

interface MessageRow {
  id: string
  group_id: string
  user_id: string
  body: string
  created_at: string
}
const COLUMNS = 'id,group_id,user_id,body,created_at'
export const toMessage = (r: MessageRow): TeamMessage => ({ id: r.id, groupId: r.group_id, userId: r.user_id, body: r.body, createdAt: Date.parse(r.created_at) })

/** Teamchat on Supabase. Row level security keeps every read to the teams you are in. */
export class TeamChat {
  constructor(private client: SupabaseClient) {}

  /** The newest messages, or the ones before [before]; in time order. */
  async load(groupId: string, before?: number): Promise<TeamMessage[]> {
    let query = this.client.from('team_messages').select(COLUMNS).eq('group_id', groupId)
    if (before !== undefined) query = query.lt('created_at', new Date(before).toISOString())
    const { data, error } = await query.order('created_at', { ascending: false }).limit(TEAM_CHAT_PAGE)
    if (error) fail(error)
    return (data as MessageRow[]).map(toMessage).reverse()
  }

  async send(groupId: string, text: string): Promise<TeamMessage | null> {
    const body = cleanMessage(text)
    if (!body) return null
    const { data, error } = await this.client.from('team_messages').insert({ group_id: groupId, body }).select(COLUMNS).single()
    if (error) fail(error)
    return toMessage(data as MessageRow)
  }

  /** Your own message, or any as owner or admin. */
  async remove(id: string): Promise<void> {
    const { error } = await this.client.from('team_messages').delete().eq('id', id)
    if (error) fail(error)
  }

  /** New messages in one team (or in all your teams without [groupId]); returns the unsubscribe. */
  watch(groupId: string | null, onMessage: (m: TeamMessage) => void): () => void {
    const channel = this.client.channel(`team-chat-${groupId ?? 'all'}-${Math.random().toString(36).slice(2)}`)
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages', ...(groupId ? { filter: `group_id=eq.${groupId}` } : {}) }, (payload: { new: MessageRow }) => onMessage(toMessage(payload.new)))
    channel.subscribe()
    return () => void this.client.removeChannel(channel)
  }
}

/** When you last read each team's chat, on this device. */
export function chatReadAt(groupId: string): number {
  try {
    const all = JSON.parse(readStorage(READ_KEY) ?? '{}') as Record<string, number>
    return typeof all[groupId] === 'number' ? all[groupId] : 0
  } catch {
    return 0
  }
}

export function markChatRead(groupId: string, at = Date.now()): void {
  let all: Record<string, number> = {}
  try {
    all = JSON.parse(readStorage(READ_KEY) ?? '{}') as Record<string, number>
  } catch {
    all = {}
  }
  if ((all[groupId] ?? 0) >= at) return
  writeStorage(READ_KEY, JSON.stringify({ ...all, [groupId]: at }))
}

/** The team whose chat is open and visible right now: no notice for messages there. */
let openChat: string | null = null
export function setOpenChat(groupId: string | null): void {
  openChat = groupId
}

/**
 * A notice for every new message of someone else in one of your teams, while NEXUS runs on this
 * device, and an entry in the Universal Inbox. Nothing when that chat is open in front of you.
 */
export function startTeamChatNotices(client: SupabaseClient | null, enabled: () => boolean): () => void {
  if (!client) return () => {}
  const chat = new TeamChat(client)
  const names = new Map<string, string>()
  let me: string | null = null
  let stop: (() => void) | null = null

  const nameOf = async (table: 'study_groups' | 'study_group_members', m: TeamMessage): Promise<string> => {
    const key = table === 'study_groups' ? `g:${m.groupId}` : `m:${m.groupId}:${m.userId}`
    const known = names.get(key)
    if (known) return known
    const { data } =
      table === 'study_groups'
        ? await client.from('study_groups').select('name').eq('id', m.groupId).maybeSingle()
        : await client.from('study_group_members').select('display_name').eq('group_id', m.groupId).eq('user_id', m.userId).maybeSingle()
    const row = data as { name?: string; display_name?: string } | null
    const name = row?.name ?? row?.display_name ?? (table === 'study_groups' ? 'je team' : 'Iemand')
    names.set(key, name)
    return name
  }

  const onMessage = async (m: TeamMessage) => {
    if (!enabled() || m.userId === me) return
    if (openChat === m.groupId && typeof document !== 'undefined' && document.visibilityState === 'visible') return
    try {
      const [team, sender] = await Promise.all([nameOf('study_groups', m), nameOf('study_group_members', m)])
      const notice = chatNotice(sender, team, m.body)
      const fresh = eventBus.publish({ id: `team-chat:${m.id}`, source: 'study_group', type: 'team.message', at: m.createdAt, title: notice.title, body: notice.body, link: { app: 'teams' }, correlationId: `team-chat:${m.groupId}` })
      // Another open tab of NEXUS already showed it.
      if (fresh) await showLocalNotification(notice.title, notice.body, `team-chat:${m.groupId}`)
    } catch (err) {
      logEvent('sync', `Teamchat: melding lukte niet: ${err instanceof Error ? err.message : err}`, true)
    }
  }

  const listen = (userId: string | null) => {
    me = userId
    stop?.()
    stop = userId ? chat.watch(null, (m) => void onMessage(m)) : null
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
