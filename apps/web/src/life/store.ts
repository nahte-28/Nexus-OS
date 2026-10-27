import { toLifeItem, type AppointmentDraft, type DeadlineDraft, type LifeItem, type LocalStore, type Project } from '@nexus/core'
import { getAll, getMeta, write } from '../state/db'

const DIRTY_KEY = 'life.dirty'
const CURSOR_KEY = 'life.cursor'

type Listener = () => void

/**
 * Deadlines, appointments and projects on this device. Like notes they live in IndexedDB, work offline and
 * stay marked dirty until the sync uploads them.
 */
export class LifeStore implements LocalStore<LifeItem> {
  private records = new Map<string, LifeItem>()
  private dirty = new Set<string>()
  private cursorValue: string | null = null
  private visible: LifeItem[] = []
  private listeners = new Set<Listener>()
  private channel: BroadcastChannel | null = null
  private writes: Promise<void> = Promise.resolve()
  ready: Promise<void>

  constructor() {
    this.ready = this.load()
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('nexus-life')
      // Another tab changed data: reload from IndexedDB.
      this.channel.onmessage = () => void this.load()
    }
  }

  private async load(): Promise<void> {
    try {
      const [stored, dirty, cursor] = await Promise.all([getAll<unknown>('life'), getMeta<string[]>(DIRTY_KEY), getMeta<string | null>(CURSOR_KEY)])
      this.records = new Map(stored.map(toLifeItem).filter((i): i is LifeItem => i !== null).map((i) => [i.id, i]))
      this.dirty = new Set(dirty ?? [])
      this.cursorValue = cursor ?? null
    } catch {
      // No IndexedDB (private mode): deadlines stay in memory only.
    }
    this.emit(false)
  }

  private persist(put: LifeItem[]): Promise<void> {
    const meta = { [DIRTY_KEY]: [...this.dirty], [CURSOR_KEY]: this.cursorValue }
    // Serialize writes so an older snapshot never overwrites a newer one.
    this.writes = this.writes.then(() => write({ store: 'life', put, meta })).catch((err) => {
      console.error('NEXUS: kon deadlines niet opslaan', err)
    })
    return this.writes
  }

  private emit(broadcast = true): void {
    this.visible = [...this.records.values()].filter((i) => i.deletedAt === null)
    if (broadcast) this.channel?.postMessage('changed')
    for (const l of this.listeners) l()
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Every deadline and project that is not deleted. */
  getSnapshot = (): LifeItem[] => this.visible

  private async save(item: LifeItem): Promise<void> {
    await this.ready
    this.records.set(item.id, item)
    this.dirty.add(item.id)
    this.emit(false)
    await this.persist([item])
    this.channel?.postMessage('changed')
  }

  async addDeadline(draft: DeadlineDraft, now = Date.now()): Promise<string> {
    const id = crypto.randomUUID()
    await this.save({ ...draft, kind: 'deadline', id, doneAt: null, updatedAt: now, deletedAt: null })
    return id
  }

  async updateDeadline(id: string, patch: Partial<DeadlineDraft & { doneAt: number | null }>, now = Date.now()): Promise<void> {
    const item = this.records.get(id)
    if (item?.kind === 'deadline') await this.save({ ...item, ...patch, updatedAt: now })
  }

  async addAppointment(draft: AppointmentDraft, now = Date.now()): Promise<string> {
    const id = crypto.randomUUID()
    await this.save({ ...draft, kind: 'appointment', id, updatedAt: now, deletedAt: null })
    return id
  }

  async updateAppointment(id: string, patch: Partial<AppointmentDraft>, now = Date.now()): Promise<void> {
    const item = this.records.get(id)
    if (item?.kind === 'appointment') await this.save({ ...item, ...patch, updatedAt: now })
  }

  async addProject(name: string, color: Project['color'] = null, now = Date.now()): Promise<string> {
    const id = crypto.randomUUID()
    await this.save({ kind: 'project', id, name: name.trim().slice(0, 160), color, archived: false, updatedAt: now, deletedAt: null })
    return id
  }

  async updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'color' | 'archived'>>, now = Date.now()): Promise<void> {
    const item = this.records.get(id)
    if (item?.kind === 'project') await this.save({ ...item, ...patch, updatedAt: now })
  }

  /** Deletes a deadline, or a project; the project's deadlines stay, without a project. */
  async remove(id: string, now = Date.now()): Promise<void> {
    const item = this.records.get(id)
    if (!item) return
    if (item.kind === 'project') {
      for (const d of this.records.values()) {
        if (d.kind === 'deadline' && d.projectId === id && d.deletedAt === null) await this.save({ ...d, projectId: null, updatedAt: now })
      }
    }
    await this.save({ ...item, deletedAt: now, updatedAt: now })
  }

  // LocalStore, used by the sync.
  all(): LifeItem[] {
    return [...this.records.values()]
  }

  dirtyIds(): string[] {
    return [...this.dirty]
  }

  cursor(): string | null {
    return this.cursorValue
  }

  async commit({ upserts, cleanIds, cursor }: { upserts: LifeItem[]; cleanIds: string[]; cursor: string | null }) {
    for (const i of upserts) this.records.set(i.id, i)
    for (const id of cleanIds) this.dirty.delete(id)
    this.cursorValue = cursor
    await this.persist(upserts)
    this.emit()
  }

  /** Forgets this device's copy after sign-out; IndexedDB itself is cleared by the sign-out. */
  async reset(): Promise<void> {
    await this.writes
    this.records.clear()
    this.dirty.clear()
    this.cursorValue = null
    this.emit()
  }
}

export const lifeStore = new LifeStore()
