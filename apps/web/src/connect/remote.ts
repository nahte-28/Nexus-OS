import type { SupabaseClient } from '@supabase/supabase-js'
import type { Device, DevicePlatform, Envelope } from '@nexus/core'

export interface ConnectMessage extends Envelope {
  id: string
  senderDeviceId: string
}

export interface OutgoingMessage extends Envelope {
  senderDeviceId: string
  recipientDeviceId: string
}

/** Where the browser's push service can wake this device. */
export interface PushSubscriptionKeys {
  endpoint: string
  p256dh: string
  auth: string
}

/** A notification for a phone without NEXUS open, sent by the database at [at]. */
export interface PlannedPush extends OutgoingMessage {
  ref: string
  at: number
}

/** The server side of NEXUS Connect. It only ever sees public keys and ciphertext. */
export interface ConnectRemote {
  listDevices(): Promise<Device[]>
  registerDevice(device: { id: string; name: string; platform: DevicePlatform; publicKey: string }): Promise<void>
  updateDevice(id: string, patch: { name?: string; revoked?: boolean; seen?: boolean }): Promise<void>
  fetchMessages(deviceId: string): Promise<ConnectMessage[]>
  deleteMessages(ids: string[]): Promise<void>
  sendMessages(messages: OutgoingMessage[]): Promise<void>
  /** Calls `onMessage` when something arrives for `deviceId`; returns an unsubscribe function. */
  listen(deviceId: string, onMessage: () => void): () => void
  /** Web push (v0.8.3 migration). Optional so that older fakes and setups keep working. */
  savePushSubscription?(deviceId: string, keys: PushSubscriptionKeys): Promise<void>
  removePushSubscription?(deviceId: string): Promise<void>
  /** Replaces what this sender planned for one phone; pushes that are (almost) due stay. */
  replacePushPlan?(senderDeviceId: string, recipientDeviceId: string, pushes: PlannedPush[]): Promise<void>
  /** Adds pushes; one that is already planned for that phone (same ref) is left as it is. */
  addPushes?(pushes: PlannedPush[]): Promise<void>
}

/** Planned pushes due within this margin are not replaced, so a notification that is about to go out still does. */
const KEEP_DUE_MS = 2 * 60_000

/** Thrown when the v0.4 migration has not been run on the Supabase project yet. */
export class ConnectSetupError extends Error {}

interface DeviceRow {
  id: string
  name: string
  platform: DevicePlatform
  public_key: string
  created_at: string
  last_seen_at: string
  revoked_at: string | null
}

function check(error: { code?: string; message: string } | null): void {
  if (!error) return
  if (error.code === '42P01' || error.code === 'PGRST205' || /could not find the table|does not exist/i.test(error.message)) {
    throw new ConnectSetupError(error.message)
  }
  throw new Error(error.message)
}

export function createConnectRemote(client: SupabaseClient): ConnectRemote {
  return {
    async listDevices() {
      const { data, error } = await client
        .from('devices')
        .select('id,name,platform,public_key,created_at,last_seen_at,revoked_at')
        .order('created_at', { ascending: true })
      check(error)
      // Without the web-push migration nothing can be woken by push; that is not an error.
      const pushed = await client.from('push_subscriptions').select('device_id')
      const push = new Set(pushed.error ? [] : (pushed.data ?? []).map((r) => r.device_id as string))
      return ((data ?? []) as DeviceRow[]).map((r) => ({
        id: r.id,
        name: r.name,
        platform: r.platform,
        publicKey: r.public_key,
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at,
        revokedAt: r.revoked_at,
        ...(push.has(r.id) ? { push: true } : {}),
      }))
    },

    async registerDevice({ id, name, platform, publicKey }) {
      const { error } = await client.from('devices').insert({ id, name, platform, public_key: publicKey })
      check(error)
    },

    async updateDevice(id, { name, revoked, seen }) {
      const now = new Date().toISOString()
      const patch = {
        ...(name !== undefined ? { name } : {}),
        ...(revoked ? { revoked_at: now } : {}),
        ...(seen ? { last_seen_at: now } : {}),
      }
      const { error } = await client.from('devices').update(patch).eq('id', id)
      check(error)
    },

    async fetchMessages(deviceId) {
      const { data, error } = await client
        .from('connect_messages')
        .select('id,sender_device_id,ephemeral_key,iv,ciphertext')
        .eq('recipient_device_id', deviceId)
        .order('created_at', { ascending: true })
        .limit(200)
      check(error)
      return (data ?? []).map((r) => ({
        id: r.id as string,
        senderDeviceId: r.sender_device_id as string,
        ephemeralKey: r.ephemeral_key as string,
        iv: r.iv as string,
        ciphertext: r.ciphertext as string,
      }))
    },

    async deleteMessages(ids) {
      if (ids.length === 0) return
      const { error } = await client.from('connect_messages').delete().in('id', ids)
      check(error)
    },

    async sendMessages(messages) {
      if (messages.length === 0) return
      const { error } = await client.from('connect_messages').insert(
        messages.map((m) => ({
          sender_device_id: m.senderDeviceId,
          recipient_device_id: m.recipientDeviceId,
          ephemeral_key: m.ephemeralKey,
          iv: m.iv,
          ciphertext: m.ciphertext,
        })),
      )
      check(error)
    },

    async savePushSubscription(deviceId, { endpoint, p256dh, auth }) {
      const { error } = await client
        .from('push_subscriptions')
        .upsert({ device_id: deviceId, endpoint, p256dh, auth, updated_at: new Date().toISOString() }, { onConflict: 'device_id' })
      check(error)
    },

    async removePushSubscription(deviceId) {
      const { error } = await client.from('push_subscriptions').delete().eq('device_id', deviceId)
      check(error)
    },

    async replacePushPlan(senderDeviceId, recipientDeviceId, pushes) {
      const { error } = await client
        .from('push_schedule')
        .delete()
        .eq('sender_device_id', senderDeviceId)
        .eq('recipient_device_id', recipientDeviceId)
        .is('sent_at', null)
        .gt('at', new Date(Date.now() + KEEP_DUE_MS).toISOString())
      check(error)
      await this.addPushes!(pushes)
    },

    async addPushes(pushes) {
      if (pushes.length === 0) return
      const { error } = await client.from('push_schedule').upsert(
        pushes.map((p) => ({
          sender_device_id: p.senderDeviceId,
          recipient_device_id: p.recipientDeviceId,
          ref: p.ref,
          at: new Date(p.at).toISOString(),
          ephemeral_key: p.ephemeralKey,
          iv: p.iv,
          ciphertext: p.ciphertext,
        })),
        { onConflict: 'recipient_device_id,ref', ignoreDuplicates: true },
      )
      check(error)
    },

    listen(deviceId, onMessage) {
      const channel = client
        .channel(`connect-${deviceId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'connect_messages', filter: `recipient_device_id=eq.${deviceId}` },
          onMessage,
        )
        .subscribe()
      return () => void client.removeChannel(channel)
    },
  }
}
