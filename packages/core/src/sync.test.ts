import { describe, expect, it } from 'vitest'
import { syncOnce, type LocalStore, type PullResult, type RemoteStore, type SyncRecord } from './sync'

interface Rec extends SyncRecord {
  text: string
}

/** Mimics the Supabase table: server-side last-write-wins plus a sequence cursor. */
class FakeServer implements RemoteStore<Rec> {
  rows = new Map<string, { rec: Rec; seq: number }>()
  seq = 0
  async push(records: Rec[]) {
    for (const rec of records) {
      const existing = this.rows.get(rec.id)
      if (existing && existing.rec.updatedAt > rec.updatedAt) continue
      this.rows.set(rec.id, { rec: { ...rec }, seq: ++this.seq })
    }
  }
  async pull(cursor: string | null): Promise<PullResult<Rec>> {
    const since = cursor ? Number(cursor) : 0
    const rows = [...this.rows.values()].filter((r) => r.seq > since)
    return { records: rows.map((r) => ({ ...r.rec })), cursor: String(this.seq) }
  }
}

class Device implements LocalStore<Rec> {
  records = new Map<string, Rec>()
  dirty = new Set<string>()
  cur: string | null = null
  edit(id: string, text: string, at: number, deleted = false) {
    this.records.set(id, { id, text, updatedAt: at, deletedAt: deleted ? at : null })
    this.dirty.add(id)
  }
  all() {
    return [...this.records.values()]
  }
  dirtyIds() {
    return [...this.dirty]
  }
  cursor() {
    return this.cur
  }
  async commit({ upserts, cleanIds, cursor }: { upserts: Rec[]; cleanIds: string[]; cursor: string | null }) {
    for (const r of upserts) this.records.set(r.id, r)
    for (const id of cleanIds) this.dirty.delete(id)
    this.cur = cursor
  }
}

describe('syncOnce', () => {
  it('moves offline edits from one device to another', async () => {
    const server = new FakeServer()
    const pc = new Device()
    const phone = new Device()
    pc.edit('a', 'van pc', 1)
    await syncOnce(pc, server)
    expect(pc.dirty.size).toBe(0)
    const report = await syncOnce(phone, server)
    expect(report.applied).toBe(1)
    expect(phone.records.get('a')?.text).toBe('van pc')
  })

  it('resolves conflicts with the newest edit on both devices', async () => {
    const server = new FakeServer()
    const pc = new Device()
    const phone = new Device()
    pc.edit('a', 'oud', 1)
    await syncOnce(pc, server)
    await syncOnce(phone, server)
    // Both edit while offline; the phone edits later.
    pc.edit('a', 'pc', 5)
    phone.edit('a', 'gsm', 9)
    await syncOnce(phone, server)
    await syncOnce(pc, server)
    await syncOnce(phone, server)
    expect(pc.records.get('a')?.text).toBe('gsm')
    expect(phone.records.get('a')?.text).toBe('gsm')
    expect(server.rows.get('a')?.rec.text).toBe('gsm')
  })

  it('syncs deletions as tombstones', async () => {
    const server = new FakeServer()
    const pc = new Device()
    const phone = new Device()
    pc.edit('a', 'weg', 1)
    await syncOnce(pc, server)
    await syncOnce(phone, server)
    phone.edit('a', 'weg', 2, true)
    await syncOnce(phone, server)
    await syncOnce(pc, server)
    expect(pc.records.get('a')?.deletedAt).toBe(2)
  })

  it('keeps a record dirty when it is edited during a sync', async () => {
    const server = new FakeServer()
    const pc = new Device()
    pc.edit('a', 'eerste', 1)
    const realPush = server.push.bind(server)
    server.push = async (records) => {
      await realPush(records)
      pc.edit('a', 'tweede', 2)
    }
    await syncOnce(pc, server)
    expect(pc.dirty.has('a')).toBe(true)
    expect(pc.records.get('a')?.text).toBe('tweede')
  })

  it('leaves local data and dirty ids untouched when offline', async () => {
    const pc = new Device()
    pc.edit('a', 'offline', 1)
    const offline: RemoteStore<Rec> = {
      push: () => Promise.reject(new Error('offline')),
      pull: () => Promise.reject(new Error('offline')),
    }
    await expect(syncOnce(pc, offline)).rejects.toThrow('offline')
    expect(pc.dirty.has('a')).toBe(true)
  })
})

describe('syncOnce with conflict copies', () => {
  let n = 0
  const copy = (loser: Rec, winner: Rec): Rec | null =>
    loser.deletedAt !== null || loser.text === winner.text ? null : { id: `kopie-${++n}`, text: `${loser.text} (kopie)`, updatedAt: 100 + n, deletedAt: null }
  const opts = { conflictCopy: copy }

  async function shared() {
    const server = new FakeServer()
    const pc = new Device()
    const phone = new Device()
    pc.edit('a', 'oud', 1)
    await syncOnce(pc, server, opts)
    await syncOnce(phone, server, opts)
    return { server, pc, phone }
  }

  it('keeps the older edit as a copy on the device that loses', async () => {
    const { server, pc, phone } = await shared()
    pc.edit('a', 'pc', 5)
    phone.edit('a', 'gsm', 9)
    await syncOnce(phone, server, opts)
    const report = await syncOnce(pc, server, opts)
    await syncOnce(phone, server, opts)
    expect(report.copies).toBe(1)
    expect(pc.records.get('a')?.text).toBe('gsm')
    const texts = (d: Device) => d.all().map((r) => r.text).sort()
    expect(texts(pc)).toEqual(['gsm', 'pc (kopie)'])
    expect(texts(phone)).toEqual(['gsm', 'pc (kopie)'])
    expect(pc.dirty.size).toBe(0)
  })

  it('keeps the server version as a copy when the newer edit syncs last', async () => {
    const { server, pc, phone } = await shared()
    phone.edit('a', 'gsm', 5)
    await syncOnce(phone, server, opts)
    pc.edit('a', 'pc', 9)
    const report = await syncOnce(pc, server, opts)
    await syncOnce(phone, server, opts)
    expect(report.copies).toBe(1)
    expect(server.rows.get('a')?.rec.text).toBe('pc')
    expect(phone.all().map((r) => r.text).sort()).toEqual(['gsm (kopie)', 'pc'])
  })

  it('makes no copy without a conflict or for identical text', async () => {
    const { server, pc, phone } = await shared()
    pc.edit('a', 'nieuw', 5)
    expect((await syncOnce(pc, server, opts)).copies).toBe(0)
    await syncOnce(phone, server, opts)
    pc.edit('a', 'zelfde', 7)
    phone.edit('a', 'zelfde', 8)
    await syncOnce(phone, server, opts)
    expect((await syncOnce(pc, server, opts)).copies).toBe(0)
    expect(pc.all()).toHaveLength(1)
  })

  it('does not copy an own upload back on the next round', async () => {
    const { server, pc } = await shared()
    pc.edit('a', 'een', 5)
    await syncOnce(pc, server, opts)
    pc.edit('a', 'twee', 6)
    expect((await syncOnce(pc, server, opts)).copies).toBe(0)
    expect(pc.all()).toHaveLength(1)
  })
})
