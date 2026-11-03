import { describe, expect, it } from 'vitest'
import { addRecent, checkCommand, emptyLauncher, isPinned, LAUNCHER_COMMANDS, launcherResults, MAX_PINNED, MAX_RECENT, parseLauncher, previewCommand, togglePin, type LauncherRef } from './launcher'

const ref = (id: string): LauncherRef => ({ kind: 'note', id, title: `Notitie ${id}`, app: 'notes' })
const cmd = (id: string) => LAUNCHER_COMMANDS.find((c) => c.id === id)!

describe('NEXUS Launcher', () => {
  it('keeps recent items newest first, once each, and at most 20', () => {
    let s = emptyLauncher()
    for (let i = 0; i < 25; i++) s = addRecent(s, ref(String(i)), i)
    s = addRecent(s, ref('3'), 100)
    expect(s.recent).toHaveLength(MAX_RECENT)
    expect(s.recent[0]).toMatchObject({ id: '3', at: 100 })
    expect(s.recent.filter((r) => r.id === '3')).toHaveLength(1)
    expect(parseLauncher(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })

  it('pins and unpins, at most twelve', () => {
    let s = togglePin(emptyLauncher(), ref('a'))
    expect(isPinned(s, ref('a'))).toBe(true)
    s = togglePin(s, ref('a'))
    expect(s.pinned).toEqual([])
    for (let i = 0; i < 15; i++) s = togglePin(s, ref(String(i)))
    expect(s.pinned).toHaveLength(MAX_PINNED)
    expect(s.pinned[0].id).toBe('3')
  })

  it('drops anything malformed from storage', () => {
    expect(parseLauncher({ recent: [{ kind: 'virus', id: 'x', title: 'x', app: 'notes', at: 1 }, { kind: 'note', id: 'n', title: 'N', app: 'notes' }], pinned: 'nee' })).toEqual(emptyLauncher())
    expect(parseLauncher(null)).toEqual(emptyLauncher())
  })

  it('finds commands and settings pages', () => {
    const found = launcherResults('herinnering', LAUNCHER_COMMANDS)
    expect(found.map((r) => [r.kind, r.id])).toEqual([['command', 'reminder.new']])
    expect(launcherResults('thema', []).map((r) => r.id)).toEqual(['settings'])
    expect(launcherResults('sql', []).map((r) => r.id)).toEqual(['account-database'])
    expect(launcherResults('  ', LAUNCHER_COMMANDS)).toEqual([])
  })

  it('checks the input and says what a command will do', () => {
    const now = Date.parse('2026-11-03T12:00')
    expect(checkCommand(cmd('reminder.new'), { title: '', at: '2026-11-03T13:00' }, now)).toBe('Vul "Waaraan?" in.')
    expect(checkCommand(cmd('reminder.new'), { title: 'Bellen', at: '2026-11-03T10:00' }, now)).toBe('"Wanneer" ligt in het verleden.')
    expect(checkCommand(cmd('reminder.new'), { title: 'Bellen', at: 'morgen' }, now)).toBe('"Wanneer" is geen geldig moment.')
    expect(checkCommand(cmd('reminder.new'), { title: 'Bellen', at: '2026-11-03T13:00' }, now)).toBeNull()
    expect(checkCommand(cmd('profile.switch'), { profile: 'hacker' }, now)).toMatch(/geldige waarde/)
    expect(checkCommand(cmd('note.new'), {}, now)).toBeNull()
    expect(previewCommand(cmd('profile.switch'), { profile: 'gaming' })).toBe('Zet het profiel Gaming aan tot je zelf wisselt.')
    expect(previewCommand(cmd('reminder.new'), { title: 'Bellen', at: '2026-11-03T13:00' })).toMatch(/^Zet een herinnering "Bellen" op .*13:00/)
  })

  it('has no command that deletes or sends anything away', () => {
    expect(LAUNCHER_COMMANDS.map((c) => c.id).filter((id) => /delete|remove|send|wipe/.test(id))).toEqual([])
  })
})
