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
