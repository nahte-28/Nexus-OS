import { describe, expect, it } from 'vitest'
import { columnsFor, defaultSizeOf, fillGaps, moveWidget, packWidgets, parseLayout, resizeBy, rowsOf, setSize, sizeFromDrag, sizeOf, spanOn, widgetAt, widgetTier } from './dashboardLayout'
import { applyRole, defaultDashboard, defaultProfilesState, hideWidgetOn, parseProfilesState, showWidgetOn, widgetsOnDevice, type Profile } from './profiles'

describe('dashboard layout', () => {
  it('keeps sizes within the grid and does not store the default', () => {
    let layout = setSize({}, 'notes', { w: 9, h: 0 })
    expect(layout).toEqual({ notes: { w: 6, h: 1 } })
    layout = setSize(layout, 'notes', { w: 1, h: 2 })
    expect(layout).toEqual({})
    expect(sizeOf(layout, 'notes')).toEqual({ w: 1, h: 2 })
    expect(sizeOf(layout, 'finance')).toEqual({ w: 1, h: 1 })
    expect(resizeBy({}, 'finance', 1, 1)).toEqual({ finance: { w: 2, h: 2 } })
    expect(setSize({}, 'devices', { w: 3, h: 9 })).toEqual({ devices: { w: 3, h: 4 } })
  })

  it('dashboard 2.0: starts big where it matters, per profile, and keeps your own sizes', () => {
    expect(defaultSizeOf('today')).toEqual({ w: 6, h: 1 })
    expect(defaultSizeOf('profile')).toEqual({ w: 1, h: 1 })
    expect(defaultSizeOf('profile', 'gaming')).toEqual({ w: 2, h: 1 })
    expect(defaultSizeOf('gaming', 'gaming')).toEqual({ w: 2, h: 2 })
    expect(sizeOf({ profile: { w: 3, h: 1 } }, 'profile', 'gaming')).toEqual({ w: 3, h: 1 })
    // The profile's own default is not stored either.
    expect(setSize({}, 'gaming', { w: 2, h: 2 }, 'gaming')).toEqual({})
    expect(setSize({}, 'gaming', { w: 1, h: 1 }, 'gaming')).toEqual({ gaming: { w: 1, h: 1 } })
    expect(widgetTier('today')).toBe('main')
    expect(widgetTier('clock')).toBe('side')
  })

  it('dashboard 2.0: the default puts your day, the week and deadlines first', () => {
    const state = defaultProfilesState()
    for (const id of ['school', 'personal', 'developer'] as const) {
      expect(state.profiles[id].widgets.slice(0, 3)).toEqual(['today', 'agenda_week', 'deadlines'])
      const packed = packWidgets(state.profiles[id].widgets.map((w) => ({ id: w, size: sizeOf({}, w, id) })), 6)
      // The week and deadlines sit side by side right under Mijn dag.
      expect(packed.find((p) => p.id === 'agenda_week')).toMatchObject({ x: 0, y: 1 })
      expect(packed.find((p) => p.id === 'deadlines')).toMatchObject({ x: 4, y: 1 })
    }
    expect(defaultDashboard(state, 'school')).toEqual({ widgets: state.profiles.school.widgets, layout: {}, hiddenOn: {} })
    const working = applyRole(state, 'work')
    expect(defaultDashboard(working, 'school').widgets).not.toContain('klashub')
    expect(defaultDashboard(working, 'school').widgets[0]).toBe('today')
  })

  it('shows other widgets on the phone than on the computer', () => {
    let p: Pick<Profile, 'widgets' | 'hiddenOn'> = { widgets: ['today', 'clock', 'shortcuts'], hiddenOn: {} }
    p = hideWidgetOn(p, 'phone', 'clock')
    expect(widgetsOnDevice(p, 'phone')).toEqual(['today', 'shortcuts'])
    expect(widgetsOnDevice(p, 'pc')).toEqual(['today', 'clock', 'shortcuts'])
    // Hidden on both: it leaves the profile.
    p = hideWidgetOn(p, 'pc', 'clock')
    expect(p.widgets).toEqual(['today', 'shortcuts'])
    expect(p.hiddenOn).toEqual({ phone: [] })
    // Added on the computer: only there.
    p = showWidgetOn(p, 'pc', 'notes')
    expect(widgetsOnDevice(p, 'pc')).toContain('notes')
    expect(widgetsOnDevice(p, 'phone')).not.toContain('notes')
    p = showWidgetOn(p, 'phone', 'notes')
    expect(widgetsOnDevice(p, 'phone')).toContain('notes')
    const parsed = parseProfilesState({ schema: 17, profiles: { school: { hiddenOn: { phone: ['clock', 'weird', 'clock'], pc: 'x' } } } })
    expect(parsed.profiles.school.hiddenOn).toEqual({ phone: ['clock'] })
  })

  it('reads stored layouts and drops what it does not know', () => {
    expect(parseLayout({ notes: { w: 2.4, h: 2 }, weird: { w: 2, h: 2 }, devices: 'big', finance: { w: 'x', h: 1 } })).toEqual({ notes: { w: 2, h: 2 } })
    expect(parseLayout(null)).toEqual({})
    expect(parseLayout([1])).toEqual({})
  })

  it('turns a drag on the corner into whole cells', () => {
    const cell = { width: 300, height: 150 }
    expect(sizeFromDrag({ w: 1, h: 1 }, 160, 10, cell)).toEqual({ w: 2, h: 1 })
    expect(sizeFromDrag({ w: 1, h: 1 }, 140, 80, cell)).toEqual({ w: 1, h: 2 })
    expect(sizeFromDrag({ w: 2, h: 2 }, -2000, -2000, cell)).toEqual({ w: 1, h: 1 })
    expect(sizeFromDrag({ w: 2, h: 1 }, 5000, 0, cell)).toEqual({ w: 6, h: 1 })
  })

  it('moves a widget among the shown ones and leaves the others in place', () => {
    const all = ['next_class', 'deadlines', 'notes', 'finance', 'devices'] as const
    const shown = ['deadlines', 'notes', 'finance', 'devices'] as const
    expect(moveWidget([...all], [...shown], 'devices', 0)).toEqual(['next_class', 'devices', 'deadlines', 'notes', 'finance'])
    expect(moveWidget([...all], [...shown], 'deadlines', 9)).toEqual(['next_class', 'notes', 'finance', 'devices', 'deadlines'])
    expect(moveWidget([...all], [...shown], 'notes', 1)).toEqual([...all])
  })

  it('shows everything full width on a phone', () => {
    expect(spanOn({ w: 3, h: 1 }, 1)).toBe(1)
    expect(spanOn({ w: 3, h: 1 }, 2)).toBe(2)
    expect(spanOn({ w: 2, h: 1 }, 3)).toBe(2)
    expect([columnsFor(390), columnsFor(800), columnsFor(1100), columnsFor(1600)]).toEqual([1, 2, 4, 6])
  })

  it('travels with the profile and survives a stored copy', () => {
    const state = defaultProfilesState()
    state.profiles.school = { ...state.profiles.school, layout: { notes: { w: 2, h: 2 } } }
    const back = parseProfilesState(JSON.parse(JSON.stringify(state)))
    expect(back.profiles.school.layout).toEqual({ notes: { w: 2, h: 2 } })
    expect(back.profiles.personal.layout).toEqual({})
  })

  it('packs widgets densely and fills the holes on a big screen', () => {
    const items = [
      { id: 'profile' as const, size: { w: 2 as const, h: 1 as const } },
      { id: 'deadlines' as const, size: { w: 2 as const, h: 2 as const } },
      { id: 'notes' as const, size: { w: 1 as const, h: 1 as const } },
      { id: 'clock' as const, size: { w: 1 as const, h: 1 as const } },
    ]
    const packed = packWidgets(items, 6)
    expect(packed.map(({ id, x, y }) => [id, x, y])).toEqual([
      ['profile', 0, 0],
      ['deadlines', 2, 0],
      ['notes', 4, 0],
      ['clock', 5, 0],
    ])
    expect(rowsOf(packed)).toBe(2)
    const filled = fillGaps(packed, 6)
    // Nothing is left empty: every cell of the two rows belongs to a widget.
    for (let y = 0; y < 2; y++) for (let x = 0; x < 6; x++) expect(widgetAt(filled, x, y)).not.toBeNull()
    expect(filled.find((p) => p.id === 'profile')).toMatchObject({ w: 2, h: 2 })
    // On a phone everything stacks, full width.
    expect(packWidgets(items, 1).map((p) => [p.x, p.y, p.w])).toEqual([
      [0, 0, 1],
      [0, 1, 1],
      [0, 3, 1],
      [0, 4, 1],
    ])
  })

  it('gives old copies the profile card and the new widgets', () => {
    const state = defaultProfilesState()
    const old = JSON.parse(JSON.stringify({ ...state, schema: 14 }))
    old.profiles.school.widgets = ['next_class', 'deadlines', 'notes']
    const back = parseProfilesState(old)
    expect(back.profiles.school.widgets).toEqual(['today', 'profile', 'next_class', 'agenda_week', 'deadlines', 'notes', 'quick_note', 'clock', 'shortcuts'])
    expect(parseProfilesState(JSON.parse(JSON.stringify(back))).profiles.school.widgets).toEqual(back.profiles.school.widgets)
    // A copy from before the agenda widget gets it after the profile card, once.
    const v15 = JSON.parse(JSON.stringify({ ...state, schema: 15 }))
    v15.profiles.personal.widgets = ['profile', 'notes']
    expect(parseProfilesState(v15).profiles.personal.widgets).toEqual(['today', 'profile', 'agenda_week', 'notes'])
    // A copy from before Mijn dag gets it on top, once; a profile without it by default does not.
    const v16 = JSON.parse(JSON.stringify({ ...state, schema: 16 }))
    v16.profiles.school.widgets = ['profile', 'notes']
    v16.profiles.gaming.widgets = ['gaming']
    const after = parseProfilesState(v16)
    expect(after.profiles.school.widgets).toEqual(['today', 'profile', 'notes'])
    expect(after.profiles.gaming.widgets).toEqual(['gaming'])
    expect(parseProfilesState(JSON.parse(JSON.stringify(after))).profiles.school.widgets).toEqual(['today', 'profile', 'notes'])
  })
})
