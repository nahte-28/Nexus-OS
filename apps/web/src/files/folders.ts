import { getAll, update } from '../state/db'

/**
 * Folders on this pc, through the browser's File System Access API (Chrome, Edge and the
 * Windows app). NEXUS only reads them: it lists what is in a folder and opens a file when you
 * ask. The folder handle is kept in IndexedDB, so a folder stays in the list; the browser asks
 * again for permission after a restart.
 */

type PermissionMode = { mode: 'read' }
interface PermissionHandle {
  queryPermission?: (d: PermissionMode) => Promise<PermissionState>
  requestPermission?: (d: PermissionMode) => Promise<PermissionState>
}
type DirectoryHandle = FileSystemDirectoryHandle & PermissionHandle & { values(): AsyncIterable<FileSystemHandle> }

export interface SavedFolder {
  id: string
  name: string
  handle: DirectoryHandle
  addedAt: number
}

export interface FolderEntry {
  name: string
  kind: 'file' | 'directory'
  handle: FileSystemHandle
}

export const canOpenFolders = (): boolean => typeof window !== 'undefined' && 'showDirectoryPicker' in window

/** Lets you choose a folder and remembers it; null when you cancelled. */
export async function addFolder(now = Date.now()): Promise<SavedFolder | null> {
  const picker = (window as unknown as { showDirectoryPicker: (o: { mode: 'read' }) => Promise<DirectoryHandle> }).showDirectoryPicker
  let handle: DirectoryHandle
  try {
    handle = await picker({ mode: 'read' })
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') return null
    throw err
  }
  const existing = (await savedFolders()).find((f) => f.name === handle.name)
  if (existing && (await existing.handle.isSameEntry(handle))) return existing
  const folder: SavedFolder = { id: crypto.randomUUID(), name: handle.name, handle, addedAt: now }
  await update('folders', { put: [folder] })
  return folder
}

export async function savedFolders(): Promise<SavedFolder[]> {
  try {
    return (await getAll<SavedFolder>('folders')).sort((a, b) => a.name.localeCompare(b.name, 'nl'))
  } catch {
    return []
  }
}

export async function forgetFolder(id: string): Promise<void> {
  await update('folders', { remove: [id] })
}

/** True when NEXUS may read the folder; asks the browser when it has to (needs a click). */
export async function allowRead(handle: DirectoryHandle): Promise<boolean> {
  if (!handle.queryPermission) return true
  if ((await handle.queryPermission({ mode: 'read' })) === 'granted') return true
  return (await handle.requestPermission?.({ mode: 'read' })) === 'granted'
}

/** What is in a folder: subfolders first, then files, each alphabetically; hidden files are left out. */
export async function listFolder(handle: FileSystemDirectoryHandle): Promise<FolderEntry[]> {
  const entries: FolderEntry[] = []
  for await (const entry of (handle as DirectoryHandle).values()) {
    if (entry.name.startsWith('.') || entry.name.startsWith('~$')) continue
    entries.push({ name: entry.name, kind: entry.kind, handle: entry })
  }
  return entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'nl', { numeric: true }) : a.kind === 'directory' ? -1 : 1))
}
