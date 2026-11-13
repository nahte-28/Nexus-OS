import { cleanMessage, DM_DEVICES_MAX, DM_TEXT_MAX, encryptFor, openText, sealText, type DirectMessage, type SealedEnvelopes } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConnectEngine } from '../connect/engine'
import { logEvent } from '../devtools/log'
import { eventBus } from '../events/bus'
import { showLocalNotification } from '../platform/notify'
import { friendError } from './friends'

export const DM_MIGRATION = 'supabase/migrations/20261113180000_direct_messages.sql'

/** A Dutch message for Privéberichten; 'setup:<file>' asks for the SQL. */
export function dmError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/dm_messages|dm_device_keys|mark_dm_read/i.test(text) && /42P01|42883|PGRST202|PGRST205|could not find the (table|function)|does not exist/i.test(text)) return `setup:${DM_MIGRATION}`
  if (/too many messages/i.test(text)) return 'Even rustig: je stuurde net veel berichten. Probeer het over een minuut opnieuw.'
  if (/42501|row-level security/i.test(text)) return 'Je kunt alleen berichten sturen aan je vrienden.'
  return friendError(error)
}

class DmError extends Error {}
const fail = (error: { code?: string; message?: string }): never => {
  throw new DmError(dmError(error))
}

interface MessageRow {
  id: string
  sender: string
  recipient: string
  envelopes: SealedEnvelopes
  created_at: string
  read_at: string | null
}
const COLUMNS = 'id,sender,recipient,envelopes,created_at,read_at'

/** The part of NEXUS Connect privéberichten need: this device's key. */
export type Sealer = Pick<ConnectEngine, 'openSealed' | 'deviceId'>

/**
 * Privéberichten on Supabase. Texts are sealed here, once for every web and desktop device of
 * both people, so the database only holds envelopes it cannot open.
 */
export class DirectMessages {
  constructor(
    private client: SupabaseClient,
    private sealer: Sealer,
  ) {}

  private async open(row: MessageRow): Promise<DirectMessage> {
    return {
      id: row.id,
      sender: row.sender,
      recipient: row.recipient,
      createdAt: Date.parse(row.created_at),
      readAt: row.read_at ? Date.parse(row.read_at) : null,
      text: openText(await this.sealer.openSealed(row.envelopes ?? {})),
    }
  }

  /** Every message of every conversation, newest first (at most [limit]), opened on this device. */
  async recent(limit = 300): Promise<DirectMessage[]> {
    const { data, error } = await this.client.from('dm_messages').select(COLUMNS).order('created_at', { ascending: false }).limit(limit)
    if (error) fail(error)
    return Promise.all((data as MessageRow[]).map((r) => this.open(r)))
  }

  async conversation(me: string, friend: string, limit = 200): Promise<DirectMessage[]> {
    const { data, error } = await this.client
      .from('dm_messages')
      .select(COLUMNS)
      .or(`and(sender.eq.${me},recipient.eq.${friend}),and(sender.eq.${friend},recipient.eq.${me})`)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) fail(error)
    return (await Promise.all((data as MessageRow[]).map((r) => this.open(r)))).reverse()
  }

  async send(friend: string, text: string): Promise<DirectMessage | null> {
    const body = cleanMessage(text)
    if (!body || !this.sealer.deviceId) {
      if (body) throw new DmError('Privéberichten worden versleuteld met NEXUS Connect. Wacht tot Connect klaar is (Apparaten) en probeer opnieuw.')
      return null
    }
    const { data: keys, error: keyError } = await this.client.rpc('dm_device_keys', { p_friend: friend })
    if (keyError) fail(keyError)
    const devices = ((keys ?? []) as Array<{ user_id: string; device_id: string; public_key: string }>).slice(0, DM_DEVICES_MAX)
    if (!devices.some((d) => d.user_id === friend)) throw new DmError('Je vriend heeft nog geen toestel met NEXUS waarop het bericht te lezen is. Vraag om NEXUS eens te openen met hun account.')
    const plain = sealText(body.slice(0, DM_TEXT_MAX))
    const envelopes: SealedEnvelopes = {}
    for (const d of devices) envelopes[d.device_id] = await encryptFor(d.public_key, d.device_id, plain)
    const { data, error } = await this.client.from('dm_messages').insert({ recipient: friend, envelopes }).select(COLUMNS).single()
    if (error) fail(error)
    return this.open(data as MessageRow)
  }

  async markRead(friend: string): Promise<void> {
    const { error } = await this.client.rpc('mark_dm_read', { p_friend: friend })
    if (error) fail(error)
  }

  /** Removes a message for both of you. */
  async remove(id: string): Promise<void> {
    const { error } = await this.client.from('dm_messages').delete().eq('id', id)
    if (error) fail(error)
  }

  /** New and read messages (row level security applies); returns the unsubscribe. */
  watch(onMessage: (m: DirectMessage, event: 'INSERT' | 'UPDATE') => void): () => void {
    const channel = this.client.channel(`dm-${Math.random().toString(36).slice(2)}`)
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'dm_messages' }, (raw) => {
      const payload = raw as unknown as { eventType: string; new?: MessageRow }
      if ((payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') && payload.new?.id) void this.open(payload.new).then((m) => onMessage(m, payload.eventType as 'INSERT' | 'UPDATE'))
    })
    channel.subscribe()
    return () => void this.client.removeChannel(channel)
  }
}

/** The friend whose conversation is open and visible right now: no notice for messages there. */
let openConversation: string | null = null
export function setOpenConversation(friend: string | null): void {
  openConversation = friend
}

/**
 * A notice for a new privébericht while NEXUS runs on this device. The text shows only in the
 * notice on this device; the Inbox, which syncs, gets only who wrote.
 */
export function startDmNotices(client: SupabaseClient | null, sealer: Sealer, enabled: () => boolean): () => void {
  if (!client) return () => {}
  const dms = new DirectMessages(client, sealer)
  let me: string | null = null
  let stop: (() => void) | null = null
  const names = new Map<string, string>()
  const onMessage = async (m: DirectMessage, event: 'INSERT' | 'UPDATE') => {
    if (event !== 'INSERT' || !enabled() || !me || m.recipient !== me) return
    if (openConversation === m.sender && typeof document !== 'undefined' && document.visibilityState === 'visible') return
    try {
      if (!names.has(m.sender)) {
        const { data } = await client.rpc('list_friends')
        for (const f of (data ?? []) as Array<{ user_id: string; display_name: string }>) names.set(f.user_id, f.display_name)
      }
      const name = names.get(m.sender) ?? 'Een vriend'
      const fresh = eventBus.publish({ id: `dm:${m.id}`, source: 'study_group', type: 'friend.message', at: m.createdAt, title: `Privébericht van ${name}`, link: { app: 'friends' } })
      if (fresh) await showLocalNotification(`Bericht van ${name}`, m.text ? (m.text.length > 140 ? `${m.text.slice(0, 139)}…` : m.text) : 'Open Vrienden om het te lezen.', `dm:${m.sender}`)
    } catch (err) {
      logEvent('sync', `Privéberichten: melding lukte niet: ${err instanceof Error ? err.message : err}`, true)
    }
  }
  const listen = (userId: string | null) => {
    me = userId
    stop?.()
    stop = userId ? dms.watch((m, e) => void onMessage(m, e)) : null
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
