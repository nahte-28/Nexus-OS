/**
 * Back-up: everything NEXUS keeps for you in one JSON file, to save somewhere safe and put back
 * later (also on another device or account). Restoring merges: what is newer on the device stays,
 * and nothing that is only on the device is lost. Device keys of NEXUS Connect never go in it.
 */
import { toLifeItem, type LifeItem } from './life'
import { toNote, type Note } from './notes'
import type { Reminder } from './reminders'

export const BACKUP_FORMAT = 'nexus-backup'
export const BACKUP_VERSION = 1

/** The documents that sync as one row of user_settings, by their key. */
export const BACKUP_DOCS = ['grades', 'habits', 'flashcards', 'finance', 'exams', 'journal', 'spaces', 'captures', 'projecthub'] as const
export type BackupDoc = (typeof BACKUP_DOCS)[number]

export interface BackupFile {
  id: string
  name: string
  mediaType: string
  size: number
  addedAt: number
  /** The contents, base64. */
  data: string
}

export interface NexusBackup {
  format: typeof BACKUP_FORMAT
  version: number
  createdAt: number
  notes: Note[]
  life: LifeItem[]
  reminders: Reminder[]
  docs: Partial<Record<BackupDoc, unknown>>
  profiles: unknown
  flows: { flows: unknown[]; deleted: Record<string, number> } | null
  focusLog: Array<{ at: number; minutes: number; task: string }>
  files: BackupFile[]
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

function toReminder(v: unknown): Reminder | null {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.title !== 'string' || typeof v.at !== 'number') return null
  const repeat = v.repeat === 'daily' || v.repeat === 'weekly' ? v.repeat : 'none'
  const target = v.target === 'this_device' ? 'this_device' : 'phone'
  return { id: v.id, title: v.title.slice(0, 120), ...(typeof v.text === 'string' ? { text: v.text.slice(0, 1000) } : {}), at: v.at, repeat, target, createdAt: typeof v.createdAt === 'number' ? v.createdAt : v.at }
}

function toFile(v: unknown): BackupFile | null {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.name !== 'string' || typeof v.data !== 'string') return null
  return {
    id: v.id,
    name: v.name.slice(0, 200),
    mediaType: typeof v.mediaType === 'string' ? v.mediaType : 'application/octet-stream',
    size: typeof v.size === 'number' ? v.size : 0,
    addedAt: typeof v.addedAt === 'number' ? v.addedAt : 0,
    data: v.data,
  }
}

/** Reads a back-up file; a Dutch message when it is not one. */
export function parseBackup(text: string): { ok: true; value: NexusBackup } | { ok: false; error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Dit is geen back-up van NEXUS: het bestand is geen geldige JSON.' }
  }
  if (!isObject(raw) || raw.format !== BACKUP_FORMAT) return { ok: false, error: 'Dit is geen back-up van NEXUS.' }
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) return { ok: false, error: 'Deze back-up komt van een nieuwere NEXUS. Werk NEXUS eerst bij.' }
  const docs: NexusBackup['docs'] = {}
  if (isObject(raw.docs)) for (const key of BACKUP_DOCS) if (raw.docs[key] !== undefined) docs[key] = raw.docs[key]
  const flows = isObject(raw.flows) ? { flows: list(raw.flows.flows), deleted: isObject(raw.flows.deleted) ? (Object.fromEntries(Object.entries(raw.flows.deleted).filter(([, t]) => typeof t === 'number')) as Record<string, number>) : {} } : null
  return {
    ok: true,
    value: {
      format: BACKUP_FORMAT,
      version: raw.version,
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
      notes: list(raw.notes).map(toNote).filter((n): n is Note => n !== null),
      life: list(raw.life).map(toLifeItem).filter((i): i is LifeItem => i !== null),
      reminders: list(raw.reminders).map(toReminder).filter((r): r is Reminder => r !== null),
      docs,
      profiles: raw.profiles ?? null,
      flows,
      focusLog: list(raw.focusLog).filter((e): e is { at: number; minutes: number; task: string } => isObject(e) && typeof e.at === 'number' && typeof e.minutes === 'number').map((e) => ({ at: e.at, minutes: e.minutes, task: typeof e.task === 'string' ? e.task : '' })),
      files: list(raw.files).map(toFile).filter((f): f is BackupFile => f !== null),
    },
  }
}

/** What is in a back-up, in short lines for the confirmation. */
export function backupSummary(b: NexusBackup): string[] {
  const live = <T extends { deletedAt: number | null }>(xs: T[]) => xs.filter((x) => x.deletedAt === null).length
  const lines: string[] = []
  const add = (n: number, one: string, many: string) => n > 0 && lines.push(`${n} ${n === 1 ? one : many}`)
  add(live(b.notes), 'notitie', 'notities')
  add(live(b.life.filter((i) => i.kind === 'deadline')), 'deadline', 'deadlines')
  add(live(b.life.filter((i) => i.kind === 'appointment')), 'afspraak', 'afspraken')
  add(live(b.life.filter((i) => i.kind === 'project')), 'project', 'projecten')
  add(b.reminders.length, 'herinnering', 'herinneringen')
  add(b.files.length, 'bestand', 'bestanden')
  add(b.flows?.flows.length ?? 0, 'flow', 'flows')
  add(b.focusLog.length, 'focusronde', 'focusrondes')
  const names: Record<BackupDoc, string> = { grades: 'Cijfers', habits: 'Gewoontes', flashcards: 'Leerkaarten', finance: 'Financiën', exams: 'Examens', journal: 'Dagboek', spaces: 'Spaces', captures: 'Snel vastleggen', projecthub: 'Project Hub' }
  const docs = BACKUP_DOCS.filter((k) => b.docs[k] !== undefined).map((k) => names[k])
  if (docs.length) lines.push(docs.join(', '))
  if (b.profiles) lines.push('Profielen en lesrooster')
  return lines
}

/** The file name for a back-up made at [at], e.g. nexus-backup-2026-10-29.json. */
export function backupFileName(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `nexus-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

/** Records from a back-up that should replace or join the device's: absent or newer there. */
export function restoreRecords<T extends { id: string; updatedAt: number }>(local: T[], backup: T[]): T[] {
  const byId = new Map(local.map((r) => [r.id, r]))
  return backup.filter((r) => {
    const mine = byId.get(r.id)
    return !mine || r.updatedAt > mine.updatedAt
  })
}
