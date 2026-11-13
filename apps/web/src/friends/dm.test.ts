import { describe, expect, it } from 'vitest'
import { decryptWith, exportPublicKey, generateDeviceKeyPair, type Envelope } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DirectMessages, dmError } from './dm'

async function device(id: string, user: string) {
  const pair = await generateDeviceKeyPair()
  return { id, user, pair, publicKey: await exportPublicKey(pair.publicKey) }
}

describe('privéberichten', () => {
  it('seals a message for every device of both people and opens it on this one', async () => {
    const mine = await device('d-me', 'me')
    const theirs = await device('d-r', 'r')
    let inserted: { recipient: string; envelopes: Record<string, Envelope> } | null = null
    const client = {
      rpc: async (name: string) => (name === 'dm_device_keys' ? { data: [mine, theirs].map((d) => ({ user_id: d.user, device_id: d.id, public_key: d.publicKey })), error: null } : { data: null, error: null }),
      from: () => ({
        insert: (row: { recipient: string; envelopes: Record<string, Envelope> }) => {
          inserted = row
          return { select: () => ({ single: async () => ({ data: { id: 'm1', sender: 'me', recipient: row.recipient, envelopes: row.envelopes, created_at: new Date().toISOString(), read_at: null }, error: null }) }) }
        },
      }),
    } as unknown as SupabaseClient
    const sealer = {
      deviceId: mine.id,
      openSealed: async (e: Record<string, Envelope>) => (e[mine.id] ? decryptWith(mine.pair.privateKey, mine.publicKey, mine.id, e[mine.id]) : null),
    }
    const sent = await new DirectMessages(client, sealer).send('r', '  Geheim  ')
    expect(sent?.text).toBe('Geheim')
    expect(Object.keys(inserted!.envelopes).sort()).toEqual(['d-me', 'd-r'])
    expect(JSON.stringify(inserted)).not.toContain('Geheim')
    expect(JSON.parse(await decryptWith(theirs.pair.privateKey, theirs.publicKey, theirs.id, inserted!.envelopes['d-r']))).toEqual({ v: 1, text: 'Geheim' })
  })

  it('refuses when the friend has no device to read it on, and knows the SQL step', async () => {
    const client = { rpc: async () => ({ data: [], error: null }) } as unknown as SupabaseClient
    await expect(new DirectMessages(client, { deviceId: 'd', openSealed: async () => null }).send('r', 'hoi')).rejects.toThrow(/nog geen toestel/)
    expect(dmError({ code: 'PGRST205', message: "Could not find the table 'public.dm_messages'" })).toBe('setup:supabase/migrations/20261113180000_direct_messages.sql')
  })
})
