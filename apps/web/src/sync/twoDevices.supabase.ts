/**
 * Two devices, one account, a real Supabase (CI job "sync": supabase start with every migration).
 * Each "device" is its own supabase-js client with its own session and its own DocStore, the
 * same code the app runs. Runs with `npm run test:sync -w @nexus/web` and SUPABASE_URL /
 * SUPABASE_ANON_KEY of a local stack; never against the live project.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createProblem, DocStore, startDocSync } from '../state/docStore'

const url = process.env.SUPABASE_URL ?? ''
const anonKey = process.env.SUPABASE_ANON_KEY ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('Deze test draait alleen tegen een lokale Supabase (SUPABASE_URL op 127.0.0.1).')

/** A synced document like Doelen or Gewoontes: items that each win on their newest change. */
interface Doc {
  revision: number
  items: Record<string, { text: string; at: number }>
}
const KEY = 'doc.tweeapparaten'
const parse = (raw: unknown): Doc => {
  const r = (raw ?? {}) as Partial<Doc>
  return { revision: typeof r.revision === 'number' ? r.revision : 0, items: r.items && typeof r.items === 'object' ? r.items : {} }
}
const merge = (a: Doc, b: Doc): Doc => {
  const items = { ...a.items }
  for (const [id, item] of Object.entries(b.items)) if (!items[id] || items[id].at < item.at) items[id] = item
  return { revision: Math.max(a.revision, b.revision), items }
}

interface Device {
  client: SupabaseClient
  store: DocStore<Doc>
  stop: () => void
}

const email = `twee-${Date.now()}@nexus.test`
const password = 'twee-apparaten-123'
const devices: Device[] = []

function newClient(name: string): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, storageKey: `nexus-test-${name}` } })
}

async function device(name: string): Promise<Device> {
  const client = newClient(name)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  const store = new DocStore<Doc>(`nexus.test.${name}`, parse)
  const stop = startDocSync(client, store, { key: KEY, parse, merge, migration: '20261126110000_settings_docs.sql', problem: createProblem(), label: `Test ${name}` })
  const d = { client, store, stop }
  devices.push(d)
  return d
}

/** Waits until [check] holds, polling; fails with [what] after [ms]. */
async function until(what: string, check: () => boolean, ms = 15_000): Promise<void> {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error(`Niet gelukt binnen ${ms / 1000} s: ${what}`)
    await new Promise((r) => setTimeout(r, 100))
  }
}

const add = (d: Device, id: string, text: string) => d.store.update((s) => ({ ...s, items: { ...s.items, [id]: { text, at: Date.now() } } }))
const texts = (d: Device) => Object.values(d.store.getSnapshot().items).map((i) => i.text).sort()

beforeAll(async () => {
  const { error } = await newClient('signup').auth.signUp({ email, password })
  if (error) throw error
})

afterAll(async () => {
  for (const d of devices) {
    d.stop()
    await d.client.removeAllChannels()
  }
})

describe('two devices on one account', () => {
  it('shows a change from the laptop on the phone within seconds, through realtime', async () => {
    const laptop = await device('laptop')
    const phone = await device('gsm')
    // Both have done their first sync before anything changes.
    await new Promise((r) => setTimeout(r, 2000))
    add(laptop, 'a', 'Boodschappen')
    // The DocStore pushes 1.5 s after a change; the poll is every 5 minutes, so only realtime fits.
    await until('de gsm ziet het item van de laptop', () => texts(phone).includes('Boodschappen'))
    expect(phone.store.getSnapshot().revision).toBe(laptop.store.getSnapshot().revision)
  })

  it('merges changes made on both devices at the same time, and both end equal', async () => {
    const [laptop, phone] = devices
    add(laptop, 'b', 'Van de laptop')
    add(phone, 'c', 'Van de gsm')
    await until('beide apparaten hebben alle items', () => texts(laptop).length === 3 && texts(phone).length === 3, 20_000)
    await until('beide apparaten hebben dezelfde revisie', () => laptop.store.getSnapshot().revision === phone.store.getSnapshot().revision, 20_000)
    expect(texts(laptop)).toEqual(['Boodschappen', 'Van de gsm', 'Van de laptop'])
    expect(texts(phone)).toEqual(texts(laptop))
  })

  it('keeps the newest edit of the same item', async () => {
    const [laptop, phone] = devices
    add(laptop, 'a', 'Boodschappen (oud)')
    await new Promise((r) => setTimeout(r, 20))
    add(phone, 'a', 'Boodschappen (nieuw)')
    await until('beide apparaten houden de nieuwste versie', () => [laptop, phone].every((d) => d.store.getSnapshot().items.a?.text === 'Boodschappen (nieuw)'), 20_000)
  })

  it('lets nobody else read the document', async () => {
    const other = newClient('ander')
    const { error } = await other.auth.signUp({ email: `ander-${Date.now()}@nexus.test`, password })
    expect(error).toBeNull()
    const { data } = await other.from('user_settings').select('key').eq('key', KEY)
    expect(data).toEqual([])
    const { data: anon } = await newClient('anoniem').from('user_settings').select('key')
    expect(anon ?? []).toEqual([])
  })
})
