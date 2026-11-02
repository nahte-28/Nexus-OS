import { describe, expect, it } from 'vitest'
import { columnsFor, moveWidget, parseLayout, resizeBy, setSize, sizeFromDrag, sizeOf, spanOn } from './dashboardLayout'
import { defaultProfilesState, parseProfilesState } from './profiles'

describe('dashboard layout', () => {
  it('keeps sizes within the grid and does not store the default', () => {
    let layout = setSize({}, 'notes', { w: 5, h: 0 })
    expect(layout).toEqual({ notes: { w: 3, h: 1 } })
    layout = resizeBy(layout, 'notes', -2, 0)
    expect(layout).toEqual({})
    expect(sizeOf(layout, 'notes')).toEqual({ w: 1, h: 1 })
    expect(resizeBy({}, 'finance', 1, 1)).toEqual({ finance: { w: 2, h: 2 } })
  })

  it('reads stored layouts and drops what it does not know', () => {
    expect(parseLayout({ notes: { w: 2.4, h: 9 }, weird: { w: 2, h: 2 }, devices: 'big', finance: { w: 'x', h: 1 } })).toEqual({ notes: { w: 2, h: 2 } })
    expect(parseLayout(null)).toEqual({})
    expect(parseLayout([1])).toEqual({})
  })

  it('turns a drag on the corner into whole cells', () => {
    const cell = { width: 300, height: 150 }
    expect(sizeFromDrag({ w: 1, h: 1 }, 160, 10, cell)).toEqual({ w: 2, h: 1 })
    expect(sizeFromDrag({ w: 1, h: 1 }, 140, 80, cell)).toEqual({ w: 1, h: 2 })
    expect(sizeFromDrag({ w: 2, h: 2 }, -2000, -2000, cell)).toEqual({ w: 1, h: 1 })
    expect(sizeFromDrag({ w: 2, h: 1 }, 5000, 0, cell)).toEqual({ w: 3, h: 1 })
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
    expect([columnsFor(390), columnsFor(800), columnsFor(1400)]).toEqual([1, 2, 3])
  })

  it('travels with the profile and survives a stored copy', () => {
    const state = defaultProfilesState()
    state.profiles.school = { ...state.profiles.school, layout: { notes: { w: 2, h: 2 } } }
    const back = parseProfilesState(JSON.parse(JSON.stringify(state)))
    expect(back.profiles.school.layout).toEqual({ notes: { w: 2, h: 2 } })
    expect(back.profiles.personal.layout).toEqual({})
  })
})
