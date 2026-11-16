import { describe, expect, it } from 'vitest'
import { autoBackupDue, autoBackupName, autoBackups, autoBackupsToPrune, DEFAULT_AUTO_BACKUP, isAutoBackupName, parseAutoBackup } from './autoBackup'
import { defaultProfilesState, parseProfilesState } from './profiles'

const DAY = 86_400_000
const at = new Date(2026, 10, 16, 14, 30).getTime()

describe('Automatische back-up', () => {
  it('reads its settings, with weekly and 4 kept as the default', () => {
    expect(parseAutoBackup(null)).toEqual(DEFAULT_AUTO_BACKUP)
    expect(parseAutoBackup({ enabled: false, every: 'daily', keep: 8, withFiles: true })).toEqual({ enabled: false, every: 'daily', keep: 8, withFiles: true })
    expect(parseAutoBackup({ every: 'hourly', keep: 100 })).toEqual(DEFAULT_AUTO_BACKUP)
  })

  it('syncs with Profielen, also from an older copy without it', () => {
    expect(defaultProfilesState().autoBackup).toEqual(DEFAULT_AUTO_BACKUP)
    const old = { ...defaultProfilesState() } as Record<string, unknown>
    delete old.autoBackup
    expect(parseProfilesState(old).autoBackup).toEqual(DEFAULT_AUTO_BACKUP)
    expect(parseProfilesState({ ...defaultProfilesState(), autoBackup: { enabled: false } }).autoBackup.enabled).toBe(false)
  })

  it('names the files so they are recognised in Bestanden', () => {
    expect(autoBackupName(at)).toBe('nexus-auto-backup-2026-11-16-1430.json')
    expect(isAutoBackupName(autoBackupName(at))).toBe(true)
    expect(isAutoBackupName('nexus-backup-2026-11-16.json')).toBe(false)
    expect(isAutoBackupName('nexus-auto-backup-2026-11-16-1430.json.pdf')).toBe(false)
  })

  it('is due on the first time, and then after a day or a week', () => {
    const weekly = DEFAULT_AUTO_BACKUP
    expect(autoBackupDue(weekly, null, at)).toBe(true)
    expect(autoBackupDue(weekly, at - 6 * DAY, at)).toBe(false)
    // A bit later than last week still counts.
    expect(autoBackupDue(weekly, at - 7 * DAY + 3_600_000, at)).toBe(true)
    expect(autoBackupDue({ ...weekly, every: 'daily' }, at - DAY, at)).toBe(true)
    expect(autoBackupDue({ ...weekly, every: 'daily' }, at - 3_600_000, at)).toBe(false)
    expect(autoBackupDue({ ...weekly, enabled: false }, null, at)).toBe(false)
    // A clock that ran ahead on another device does not block it forever, nor start one each time.
    expect(autoBackupDue(weekly, at + DAY, at)).toBe(false)
  })

  it('keeps only the newest ones', () => {
    const files = [0, 1, 2, 3, 4].map((i) => ({ id: `b${i}`, name: autoBackupName(at - i * 7 * DAY), addedAt: at - i * 7 * DAY }))
    const all = [...files, { id: 'own', name: 'nexus-backup-2026-01-01.json', addedAt: 0 }, { id: 'pdf', name: 'les.pdf', addedAt: 1 }]
    expect(autoBackups(all).map((f) => f.id)).toEqual(['b0', 'b1', 'b2', 'b3', 'b4'])
    expect(autoBackupsToPrune(all, 2).map((f) => f.id)).toEqual(['b2', 'b3', 'b4'])
    expect(autoBackupsToPrune(all, 0).map((f) => f.id)).toEqual(['b1', 'b2', 'b3', 'b4'])
  })
})
