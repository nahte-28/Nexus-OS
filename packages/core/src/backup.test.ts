import { describe, expect, it } from 'vitest'
import { backupFileName, backupSummary, parseBackup, restoreRecords } from './backup'

const note = (id: string, updatedAt: number) => ({ id, title: id, body: '', updatedAt, deletedAt: null })

describe('back-up', () => {
  it('refuses files that are not a NEXUS back-up', () => {
    expect(parseBackup('{')).toMatchObject({ ok: false })
    expect(parseBackup('{"format":"iets"}')).toMatchObject({ ok: false })
    expect(parseBackup('{"format":"nexus-backup","version":99}')).toMatchObject({ ok: false, error: expect.stringContaining('nieuwere') })
  })

  it('reads a back-up and drops broken records', () => {
    const r = parseBackup(
      JSON.stringify({
        format: 'nexus-backup',
        version: 1,
        createdAt: 5,
        notes: [note('a', 1), { kapot: true }],
        reminders: [{ id: 'r', title: 'Bellen', at: 9, repeat: 'weekly' }, { id: 1 }],
        docs: { grades: { revision: 1 }, onbekend: {} },
        focusLog: [{ at: 1, minutes: 25, task: 'Wiskunde' }],
        files: [{ id: 'f', name: 'a.pdf', data: 'AAAA', size: 3 }],
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.notes).toHaveLength(1)
    expect(r.value.reminders).toEqual([{ id: 'r', title: 'Bellen', at: 9, repeat: 'weekly', target: 'phone', createdAt: 9 }])
    expect(Object.keys(r.value.docs)).toEqual(['grades'])
    expect(backupSummary(r.value)).toEqual(['1 notitie', '1 herinnering', '1 bestand', '1 focusronde', 'Cijfers'])
  })

  it('restores only what is absent or newer', () => {
    expect(restoreRecords([note('a', 5), note('b', 1)], [note('a', 3), note('b', 2), note('c', 1)]).map((n) => n.id)).toEqual(['b', 'c'])
  })

  it('names the file after the day', () => {
    expect(backupFileName(new Date(2026, 9, 29, 10).getTime())).toBe('nexus-backup-2026-10-29.json')
  })
})
