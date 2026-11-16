/**
 * Automatische back-up: NEXUS makes a back-up by itself now and then and keeps it in Bestanden,
 * so it is in your account and on your other devices. Only the newest few are kept. The settings
 * sync with Profielen (ProfilesState.autoBackup); which back-ups exist, every device sees in
 * Bestanden, so two devices do not both make one.
 */

export type AutoBackupEvery = 'daily' | 'weekly'
export const AUTO_BACKUP_EVERY: AutoBackupEvery[] = ['daily', 'weekly']
export const AUTO_BACKUP_KEEP = [2, 4, 8] as const

export interface AutoBackupSettings {
  enabled: boolean
  every: AutoBackupEvery
  /** How many automatic back-ups stay in Bestanden; older ones are removed. */
  keep: number
  /** Also your files; off by default, since they are in Bestanden already. */
  withFiles: boolean
}

export const DEFAULT_AUTO_BACKUP: AutoBackupSettings = { enabled: true, every: 'weekly', keep: 4, withFiles: false }

export function parseAutoBackup(raw: unknown): AutoBackupSettings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_AUTO_BACKUP.enabled,
    every: AUTO_BACKUP_EVERY.includes(r.every as AutoBackupEvery) ? (r.every as AutoBackupEvery) : DEFAULT_AUTO_BACKUP.every,
    keep: (AUTO_BACKUP_KEEP as readonly number[]).includes(r.keep as number) ? (r.keep as number) : DEFAULT_AUTO_BACKUP.keep,
    withFiles: r.withFiles === true,
  }
}

export const AUTO_BACKUP_PREFIX = 'nexus-auto-backup-'
const NAME = /^nexus-auto-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/

/** The name in Bestanden, e.g. nexus-auto-backup-2026-11-16-1430.json. */
export function autoBackupName(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${AUTO_BACKUP_PREFIX}${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`
}

export const isAutoBackupName = (name: string) => NAME.test(name)

interface FileLike {
  id: string
  name: string
  addedAt: number
}

/** The automatic back-ups in Bestanden, newest first. */
export function autoBackups<T extends FileLike>(files: T[]): T[] {
  return files.filter((f) => isAutoBackupName(f.name)).sort((a, b) => b.addedAt - a.addedAt)
}

const DAY = 86_400_000
/** A little slack, so a weekly back-up made a bit later than last week still comes the same day. */
const SLACK = 2 * 3_600_000

/** Whether a new automatic back-up is due, given when the newest one was made. */
export function autoBackupDue(settings: AutoBackupSettings, lastAt: number | null, now: number): boolean {
  if (!settings.enabled) return false
  if (lastAt === null || lastAt > now) return lastAt === null
  return now - lastAt >= (settings.every === 'daily' ? DAY : 7 * DAY) - SLACK
}

/** The automatic back-ups to remove, so only the newest [keep] stay. */
export function autoBackupsToPrune<T extends FileLike>(files: T[], keep: number): T[] {
  return autoBackups(files).slice(Math.max(1, keep))
}
