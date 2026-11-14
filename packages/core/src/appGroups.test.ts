import { describe, expect, it } from 'vitest'
import { APP_GROUP, APP_GROUPS, groupApps } from './appGroups'

describe('zijbalk in groepen', () => {
  it('zet apps per groep in vaste volgorde en houdt de volgorde binnen een groep', () => {
    const apps = [{ id: 'settings' }, { id: 'agenda' }, { id: 'study' }, { id: 'notes' }, { id: 'teams' }] as const
    expect(groupApps([...apps]).map((g) => [g.title, g.apps.map((a) => a.id)])).toEqual([
      ['School', ['study']],
      ['Planning', ['agenda', 'notes']],
      ['Samen', ['teams']],
      ['Systeem', ['settings']],
    ])
  })

  it('kent elke groep minstens één app toe', () => {
    for (const g of APP_GROUPS) expect(Object.values(APP_GROUP)).toContain(g.id)
  })
})
