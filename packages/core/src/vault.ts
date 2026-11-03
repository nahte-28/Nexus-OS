/**
 * NEXUS Vault (Next Frontier D): Bestanden grows into a vault. The files themselves stay where they
 * are (IndexedDB on the device, the private bucket `nexus-files` in your account); Vault keeps what
 * it knows about them in one document (user_settings key 'vault'): tags, collections, links to
 * Project Hub and Kennis, version chains, the trash and the share links you made. A file is never
 * changed in place: a new version is a new file that points to the first one. Pure logic.
 */
import type { FileMeta } from './files'

export interface VaultLink {
  /** A Project Hub project (an Agenda project item) or a note in Notities/Kennis. */
  kind: 'project' | 'note'
  id: string
  title: string
}

export interface VaultFile {
  /** The file's id in Bestanden. */
  id: string
  tags: string[]
  collections: string[]
  links: VaultLink[]
  /** The first file of the chain this is a newer version of; null for a first version. */
  versionOf: string | null
  /** In the trash since; removed for good after TRASH_DAYS. */
  trashedAt: number | null
  updatedAt: number
}

export interface VaultCollection {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

/** A share link you made. The link itself is not kept: it only works until expiresAt. */
export interface VaultShare {
  id: string
  fileId: string
  fileName: string
  createdAt: number
  expiresAt: number
  updatedAt: number
}

export interface VaultState {
  files: VaultFile[]
  collections: VaultCollection[]
  shares: VaultShare[]
  revision: number
}

export const TRASH_DAYS = 30
export const MAX_TAGS = 12
export const MAX_TAG = 30
export const MAX_VAULT_COLLECTIONS = 50
export const MAX_LINKS = 20
export const MAX_SHARES = 100
const DAY = 86_400_000

/** How long a share link can work; short on purpose, because it cannot be taken back early. */
export const SHARE_DURATIONS: Array<{ seconds: number; label: string }> = [
  { seconds: 3600, label: '1 uur' },
  { seconds: 86_400, label: '1 dag' },
  { seconds: 7 * 86_400, label: '7 dagen' },
]

export const emptyVault = (): VaultState => ({ files: [], collections: [], shares: [], revision: 0 })

const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '')
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const strings = (x: unknown, max: number, each: number) => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === 'string').map((s) => s.slice(0, each)))].slice(0, max) : [])

/** "Examen " → "examen"; empty when nothing is left. */
export const normalizeTag = (tag: string) => tag.trim().replace(/^#/, '').replace(/\s+/g, '-').toLowerCase().slice(0, MAX_TAG)

export function parseVault(raw: unknown): VaultState {
  if (typeof raw !== 'object' || raw === null) return emptyVault()
  const v = raw as Record<string, unknown>
  const files = (Array.isArray(v.files) ? v.files : []).flatMap((x): VaultFile[] => {
    const f = x as Record<string, unknown>
    if (typeof f?.id !== 'string') return []
    const links = (Array.isArray(f.links) ? f.links : []).flatMap((l): VaultLink[] => {
      const k = l as Record<string, unknown>
      return (k?.kind === 'project' || k?.kind === 'note') && typeof k.id === 'string' ? [{ kind: k.kind, id: k.id.slice(0, 100), title: str(k.title, 200) }] : []
    })
    return [{ id: f.id, tags: strings(f.tags, MAX_TAGS, MAX_TAG), collections: strings(f.collections, MAX_VAULT_COLLECTIONS, 100), links: links.slice(0, MAX_LINKS), versionOf: typeof f.versionOf === 'string' ? f.versionOf : null, trashedAt: num(f.trashedAt), updatedAt: num(f.updatedAt) ?? 0 }]
  })
  const collections = (Array.isArray(v.collections) ? v.collections : []).flatMap((x): VaultCollection[] => {
    const c = x as Record<string, unknown>
    return typeof c?.id === 'string' && typeof c.name === 'string' ? [{ id: c.id, name: c.name.slice(0, 60), createdAt: num(c.createdAt) ?? 0, updatedAt: num(c.updatedAt) ?? 0, deletedAt: num(c.deletedAt) }] : []
  })
  const shares = (Array.isArray(v.shares) ? v.shares : []).flatMap((x): VaultShare[] => {
    const s = x as Record<string, unknown>
    const createdAt = num(s?.createdAt)
    const expiresAt = num(s?.expiresAt)
    return typeof s?.id === 'string' && typeof s.fileId === 'string' && createdAt !== null && expiresAt !== null ? [{ id: s.id, fileId: s.fileId, fileName: str(s.fileName, 200), createdAt, expiresAt, updatedAt: num(s.updatedAt) ?? createdAt }] : []
  })
  return { files, collections, shares: shares.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_SHARES), revision: num(v.revision) ?? 0 }
}

function mergeById<T extends { id: string; updatedAt: number }>(a: T[], b: T[]): T[] {
  const byId = new Map(a.map((x) => [x.id, x]))
  for (const x of b) {
    const mine = byId.get(x.id)
    if (!mine || x.updatedAt > mine.updatedAt) byId.set(x.id, x)
  }
  return [...byId.values()]
}

/** Two copies (this device and the account): per file, collection and share the newest wins. */
export function mergeVault(a: VaultState, b: VaultState): VaultState {
  return {
    files: mergeById(a.files, b.files),
    collections: mergeById(a.collections, b.collections),
    shares: mergeById(a.shares, b.shares).sort((x, y) => y.createdAt - x.createdAt).slice(0, MAX_SHARES),
    revision: Math.max(a.revision, b.revision),
  }
}

// Reading -------------------------------------------------------------------------------------------

const blank = (id: string): VaultFile => ({ id, tags: [], collections: [], links: [], versionOf: null, trashedAt: null, updatedAt: 0 })
export const vaultFile = (s: VaultState, id: string): VaultFile => s.files.find((f) => f.id === id) ?? blank(id)
/** The first file of [id]'s chain. */
export const chainOf = (s: VaultState, id: string) => vaultFile(s, id).versionOf ?? id

export const vaultCollections = (s: VaultState) => s.collections.filter((c) => c.deletedAt === null).sort((a, b) => a.name.localeCompare(b.name, 'nl'))

/** Every version of [id]'s chain that still exists, newest first. */
export function versionsOf<F extends FileMeta>(s: VaultState, files: F[], id: string): F[] {
  const root = chainOf(s, id)
  return files.filter((f) => chainOf(s, f.id) === root).sort((a, b) => b.addedAt - a.addedAt)
}

export interface VaultEntry<F extends FileMeta> {
  file: F
  meta: VaultFile
  /** Older versions under this one. */
  versions: number
}

export interface VaultFilter {
  query?: string
  tag?: string | null
  collection?: string | null
  trash?: boolean
}

/**
 * What the vault shows: one entry per chain (its newest version, whose tags and links count for
 * the whole chain), either outside the trash or in it. Tags, collections and links live on the
 * first file of the chain, so a new version keeps them.
 */
export function vaultView<F extends FileMeta>(s: VaultState, files: F[], filter: VaultFilter = {}): Array<VaultEntry<F>> {
  const chains = new Map<string, F[]>()
  for (const f of files) {
    const root = chainOf(s, f.id)
    chains.set(root, [...(chains.get(root) ?? []), f])
  }
  const terms = (filter.query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const out: Array<VaultEntry<F>> = []
  for (const [root, list] of chains) {
    const meta = vaultFile(s, root)
    if (Boolean(meta.trashedAt) !== Boolean(filter.trash)) continue
    if (filter.tag && !meta.tags.includes(filter.tag)) continue
    if (filter.collection && !meta.collections.includes(filter.collection)) continue
    const newest = [...list].sort((a, b) => b.addedAt - a.addedAt)[0]
    const text = `${newest.name} ${meta.tags.join(' ')} ${meta.links.map((l) => l.title).join(' ')}`.toLowerCase()
    if (terms.some((t) => !text.includes(t))) continue
    out.push({ file: newest, meta, versions: list.length - 1 })
  }
  return out.sort((a, b) => (filter.trash ? (b.meta.trashedAt ?? 0) - (a.meta.trashedAt ?? 0) : b.file.addedAt - a.file.addedAt))
}

/** Every tag in use outside the trash, with how often. */
export function vaultTags(s: VaultState, files: FileMeta[]): Array<{ tag: string; count: number }> {
  const count = new Map<string, number>()
  for (const e of vaultView(s, files)) for (const t of e.meta.tags) count.set(t, (count.get(t) ?? 0) + 1)
  return [...count].map(([tag, n]) => ({ tag, count: n })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/** Files that link to [link] (a project or note), for "Bestanden bij dit project". */
export function filesLinkedTo<F extends FileMeta>(s: VaultState, files: F[], kind: VaultLink['kind'], id: string): F[] {
  return vaultView(s, files)
    .filter((e) => e.meta.links.some((l) => l.kind === kind && l.id === id))
    .map((e) => e.file)
}

/** Chains whose time in the trash is over: every file id in them is removed for good. */
export function expiredTrash(s: VaultState, files: FileMeta[], now: number): string[] {
  const roots = new Set(s.files.filter((f) => f.trashedAt !== null && now - f.trashedAt > TRASH_DAYS * DAY).map((f) => f.id))
  return files.filter((f) => roots.has(chainOf(s, f.id))).map((f) => f.id)
}

export const daysLeftInTrash = (trashedAt: number, now: number) => Math.max(0, Math.ceil((trashedAt + TRASH_DAYS * DAY - now) / DAY))

export const activeShares = (s: VaultState, now: number) => s.shares.filter((x) => x.expiresAt > now)

// Changing ------------------------------------------------------------------------------------------

function patchFile(s: VaultState, id: string, change: (f: VaultFile) => VaultFile, now: number): VaultState {
  const root = chainOf(s, id)
  const next = { ...change(vaultFile(s, root)), updatedAt: now }
  return { ...s, files: [...s.files.filter((f) => f.id !== root), next] }
}

export function setTags(s: VaultState, id: string, tags: string[], now: number): VaultState {
  const clean = [...new Set(tags.map(normalizeTag).filter(Boolean))].slice(0, MAX_TAGS)
  return patchFile(s, id, (f) => ({ ...f, tags: clean }), now)
}

export function addCollection(s: VaultState, id: string, name: string, now: number): VaultState | { error: string } {
  const clean = name.trim().slice(0, 60)
  if (!clean) return { error: 'Geef de verzameling een naam.' }
  if (vaultCollections(s).some((c) => c.name.toLowerCase() === clean.toLowerCase())) return { error: `Er is al een verzameling "${clean}".` }
  if (vaultCollections(s).length >= MAX_VAULT_COLLECTIONS) return { error: `Hoogstens ${MAX_VAULT_COLLECTIONS} verzamelingen.` }
  return { ...s, collections: [...s.collections, { id, name: clean, createdAt: now, updatedAt: now, deletedAt: null }] }
}

export function renameCollection(s: VaultState, id: string, name: string, now: number): VaultState | { error: string } {
  const clean = name.trim().slice(0, 60)
  if (!clean) return { error: 'Geef de verzameling een naam.' }
  if (vaultCollections(s).some((c) => c.id !== id && c.name.toLowerCase() === clean.toLowerCase())) return { error: `Er is al een verzameling "${clean}".` }
  return { ...s, collections: s.collections.map((c) => (c.id === id ? { ...c, name: clean, updatedAt: now } : c)) }
}

/** Removes the collection; its files stay. */
export function deleteCollection(s: VaultState, id: string, now: number): VaultState {
  return { ...s, collections: s.collections.map((c) => (c.id === id ? { ...c, deletedAt: now, updatedAt: now } : c)) }
}

export function setInCollection(s: VaultState, fileId: string, collectionId: string, on: boolean, now: number): VaultState {
  return patchFile(s, fileId, (f) => ({ ...f, collections: on ? [...new Set([...f.collections, collectionId])] : f.collections.filter((c) => c !== collectionId) }), now)
}

export function addLink(s: VaultState, fileId: string, link: VaultLink, now: number): VaultState {
  return patchFile(s, fileId, (f) => (f.links.some((l) => l.kind === link.kind && l.id === link.id) ? f : { ...f, links: [...f.links, { ...link, title: link.title.slice(0, 200) }].slice(0, MAX_LINKS) }), now)
}

export function removeLink(s: VaultState, fileId: string, link: Pick<VaultLink, 'kind' | 'id'>, now: number): VaultState {
  return patchFile(s, fileId, (f) => ({ ...f, links: f.links.filter((l) => !(l.kind === link.kind && l.id === link.id)) }), now)
}

/** [newId] is a newer version of [ofId]'s chain. */
export function addVersion(s: VaultState, newId: string, ofId: string, now: number): VaultState {
  const root = chainOf(s, ofId)
  return { ...s, files: [...s.files.filter((f) => f.id !== newId), { ...blank(newId), versionOf: root, updatedAt: now }] }
}

/** The whole chain goes to the trash, or comes back. */
export const trashFile = (s: VaultState, id: string, now: number) => patchFile(s, id, (f) => ({ ...f, trashedAt: now }), now)
export const restoreFile = (s: VaultState, id: string, now: number) => patchFile(s, id, (f) => ({ ...f, trashedAt: null }), now)

/** After files are removed for good: their entries and shares go too. */
export function forgetFiles(s: VaultState, ids: string[]): VaultState {
  const gone = new Set(ids)
  return { ...s, files: s.files.filter((f) => !gone.has(f.id)), shares: s.shares.filter((x) => !gone.has(x.fileId)) }
}

export function addShare(s: VaultState, share: Omit<VaultShare, 'updatedAt'>): VaultState {
  return { ...s, shares: [{ ...share, updatedAt: share.createdAt }, ...s.shares].slice(0, MAX_SHARES) }
}

/** Which duration a share may have; anything else is refused. */
export const checkShareSeconds = (seconds: number) => SHARE_DURATIONS.some((d) => d.seconds === seconds)
