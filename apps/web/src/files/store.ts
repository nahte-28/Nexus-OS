import { MAX_FILE_BYTES, formatSize, type FileMeta } from '@nexus/core'
import { getAll, update } from '../state/db'

/** A file as this device keeps it; [data] is null until a file from your account is opened here. */
export interface LocalFile extends FileMeta {
  data: ArrayBuffer | null
  /** Stored in your account (Supabase Storage). */
  remote: boolean
  /** Deleted here, still to be removed from your account. */
  deletedAt: number | null
}

export interface FileEntry extends FileMeta {
  /** Readable without a connection. */
  offline: boolean
  remote: boolean
}

type Listener = () => void

/**
 * Bestanden: your own files in IndexedDB, so they open offline. With an account the sync
 * (files/sync.ts) also keeps them in your private storage and brings them to your other devices.
 */
export class FilesStore {
  private records = new Map<string, LocalFile>()
  private visible: FileEntry[] = []
  private listeners = new Set<Listener>()
  private channel: BroadcastChannel | null = null
  /** Set by the sync: fetches a file from your account. */
  download: ((file: FileMeta) => Promise<Blob>) | null = null
  ready: Promise<void>

  constructor() {
    this.ready = this.load()
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('nexus-files')
      this.channel.onmessage = () => void this.load()
    }
  }

  private async load(): Promise<void> {
    try {
      const stored = await getAll<LocalFile>('files')
      this.records = new Map(stored.map((f) => [f.id, f]))
    } catch {
      // No IndexedDB (private mode): files stay in memory only.
    }
    this.emit(false)
  }

  private emit(broadcast = true): void {
    this.visible = [...this.records.values()]
      .filter((f) => f.deletedAt === null)
      .sort((a, b) => b.addedAt - a.addedAt)
      .map(({ id, name, mediaType, size, addedAt, data, remote }) => ({ id, name, mediaType, size, addedAt, offline: data !== null, remote }))
    if (broadcast) this.channel?.postMessage('changed')
    for (const l of this.listeners) l()
  }

  private async put(files: LocalFile[], remove: string[] = []): Promise<void> {
    if (files.length === 0 && remove.length === 0) return
    for (const f of files) this.records.set(f.id, f)
    for (const id of remove) this.records.delete(id)
    this.emit()
    await update('files', { put: files, remove }).catch((err) => console.error('NEXUS: kon bestanden niet opslaan', err))
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): FileEntry[] => this.visible

  /** Keeps a copy of [file] in NEXUS; throws a Dutch message when it is too big. */
  async add(file: Blob, name: string, now = Date.now()): Promise<string> {
    await this.ready
    if (file.size > MAX_FILE_BYTES) throw new Error(`"${name}" is te groot (${formatSize(file.size)}, hoogstens ${formatSize(MAX_FILE_BYTES)}).`)
    const id = crypto.randomUUID()
    const data = await file.arrayBuffer()
    await this.put([{ id, name: name.slice(0, 200), mediaType: file.type || 'application/octet-stream', size: file.size, addedAt: now, data, remote: false, deletedAt: null }])
    return id
  }

  /** Adds files from a back-up that are not on this device; the sync puts them in your account. */
  async restore(files: Array<FileMeta & { data: ArrayBuffer }>): Promise<number> {
    await this.ready
    const fresh = files.filter((f) => !this.records.has(f.id) && f.data.byteLength <= MAX_FILE_BYTES)
    await this.put(fresh.map((f) => ({ ...f, remote: false, deletedAt: null })))
    return fresh.length
  }

  async remove(id: string, now = Date.now()): Promise<void> {
    const file = this.records.get(id)
    if (!file) return
    // A file in your account stays as a tombstone until the sync removed it there too.
    if (file.remote) await this.put([{ ...file, data: null, deletedAt: now }])
    else await this.put([], [id])
  }

  /** The file's contents, from this device or else from your account (and then kept here). */
  async blob(id: string): Promise<Blob> {
    await this.ready
    const file = this.records.get(id)
    if (!file || file.deletedAt !== null) throw new Error('Dit bestand bestaat niet meer.')
    if (file.data) return new Blob([file.data], { type: file.mediaType })
    if (!this.download) throw new Error('Dit bestand staat in je account. Maak verbinding om het te openen.')
    const blob = await this.download(file)
    await this.put([{ ...(this.records.get(id) ?? file), data: await blob.arrayBuffer() }])
    return blob
  }

  // Used by the sync.
  all(): LocalFile[] {
    return [...this.records.values()]
  }

  async markRemote(ids: string[]): Promise<void> {
    const files = ids.map((id) => this.records.get(id)).filter((f): f is LocalFile => !!f)
    await this.put(files.map((f) => ({ ...f, remote: true })))
  }

  /** Applies what the account holds: new files from other devices, and ones deleted there. */
  async applyRemote(added: FileMeta[], gone: string[]): Promise<void> {
    if (added.length === 0 && gone.length === 0) return
    await this.put(
      added.map((f) => ({ ...f, data: null, remote: true, deletedAt: null })),
      gone,
    )
  }

  async forget(ids: string[]): Promise<void> {
    await this.put([], ids)
  }

  /** After sign-out; IndexedDB itself is cleared by the sign-out. */
  reset(): void {
    this.records.clear()
    this.emit()
  }
}

export const filesStore = new FilesStore()
