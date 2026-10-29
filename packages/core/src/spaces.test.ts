import { describe, expect, it } from 'vitest'
import {
  changeSpace,
  createSpace,
  deleteSpace,
  duplicateSpace,
  emptySpaces,
  layoutChanged,
  liveSpaces,
  markUsed,
  MAX_SPACES,
  mergeSpaces,
  parseSpacesState,
  SPACE_TEMPLATES,
  suggestedSpace,
  tileWindows,
} from './spaces'
import { initialWindowsState, windowsReducer } from './windows'

const win = (appId: 'notes' | 'agenda', x = 0) => ({ appId, rect: { x, y: 0, width: 400, height: 300 }, minimized: false, maximized: false })

describe('spaces', () => {
  const base = createSpace(emptySpaces(), { id: 's1', name: ' Studeren ', profileId: 'school', windows: [win('notes')] }, 10)

  it('creates, renames, archives, duplicates and deletes', () => {
    expect(base.spaces[0]).toMatchObject({ name: 'Studeren', version: 1, deletedAt: null })
    const renamed = changeSpace(base, 's1', { name: 'Blok' }, 20)
    expect(renamed.spaces[0]).toMatchObject({ name: 'Blok', updatedAt: 20, version: 1 })
    expect(changeSpace(base, 's1', { windows: [win('agenda')] }, 20).spaces[0].version).toBe(2)
    expect(changeSpace(base, 's1', { archived: true }, 20).spaces[0].archived).toBe(true)
    const copy = duplicateSpace(base, 's1', 's2', 30)
    expect(copy.spaces[1]).toMatchObject({ id: 's2', name: 'Studeren (kopie)', windows: [win('notes')] })
    expect(liveSpaces(deleteSpace(copy, 's1', 40)).map((s) => s.id)).toEqual(['s2'])
  })

  it('refuses more than the limit', () => {
    let s = emptySpaces()
    for (let i = 0; i < MAX_SPACES; i++) s = createSpace(s, { id: `s${i}`, name: 'x', profileId: 'school', windows: [] }, i)
    expect(() => createSpace(s, { id: 'extra', name: 'x', profileId: 'school', windows: [] }, 99)).toThrow()
  })

  it('merges two devices: newest change per Space and latest use per profile', () => {
    const a = markUsed(changeSpace(base, 's1', { name: 'A' }, 50), base.spaces[0], 50)
    const b = { ...markUsed(deleteSpace(base, 's1', 40), base.spaces[0], 60), suggestOnProfile: false, settingsUpdatedAt: 5 }
    const merged = mergeSpaces(a, b)
    expect(merged.spaces[0]).toMatchObject({ name: 'A', deletedAt: null })
    expect(merged.lastUsed.school?.at).toBe(60)
    expect(merged.suggestOnProfile).toBe(false)
  })

  it('suggests the last Space of a profile, unless switched off or gone', () => {
    const used = markUsed(base, base.spaces[0], 20)
    expect(suggestedSpace(used, 'school')?.id).toBe('s1')
    expect(suggestedSpace(used, 'personal')).toBeNull()
    expect(suggestedSpace({ ...used, suggestOnProfile: false }, 'school')).toBeNull()
    expect(suggestedSpace(changeSpace(used, 's1', { archived: true }, 30), 'school')).toBeNull()
  })

  it('reads stored copies and drops what is broken', () => {
    const parsed = parseSpacesState(JSON.parse(JSON.stringify({ ...base, spaces: [...base.spaces, { id: 'x' }, { ...base.spaces[0], id: 'y', profileId: 'hack' }] })))
    expect(parsed.spaces.map((s) => s.id)).toEqual(['s1'])
    expect(parseSpacesState(null)).toEqual(emptySpaces())
  })

  it('tiles template apps and notices a changed layout', () => {
    const tiled = tileWindows(SPACE_TEMPLATES[0].apps, { width: 1200, height: 700 })
    expect(tiled).toHaveLength(3)
    expect(tiled[1].rect.x).toBeGreaterThan(tiled[0].rect.x + tiled[0].rect.width - 1)
    expect(layoutChanged([win('notes')], [win('notes')])).toBe(false)
    expect(layoutChanged([win('notes')], [win('notes', 10)])).toBe(true)
  })

  it('restores a Space into the window manager', () => {
    const state = windowsReducer(windowsReducer(initialWindowsState, { type: 'open', appId: 'notes', title: 'Notities', rect: win('notes').rect }), {
      type: 'restore',
      windows: [{ ...win('agenda'), title: 'Agenda' }, { ...win('notes', 20), title: 'Notities' }],
    })
    expect(state.windows.map((w) => w.appId)).toEqual(['agenda', 'notes'])
    expect(new Set(state.windows.map((w) => w.id)).size).toBe(2)
    expect(state.focusedId).toBe(state.windows[1].id)
  })
})
