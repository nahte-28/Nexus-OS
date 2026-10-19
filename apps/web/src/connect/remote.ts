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
}

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
      return ((data ?? []) as DeviceRow[]).map((r) => ({
        id: r.id,
        name: r.name,
        platform: r.platform,
        publicKey: r.public_key,
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at,
        revokedAt: r.revoked_at,
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
