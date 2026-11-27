import { describe, expect, it } from 'vitest'
import { MAX_RECENT_APPS, parseRecentApps, pushRecentApp } from './recentApps'

describe('recent geopende apps', () => {
  it('zet de laatst geopende app vooraan zonder dubbels', () => {
    expect(pushRecentApp(['notes', 'agenda', 'grades'], 'agenda')).toEqual(['agenda', 'notes', 'grades'])
    expect(pushRecentApp([], 'darts')).toEqual(['darts'])
  })

  it('onthoudt er hoogstens een vast aantal', () => {
    let list = pushRecentApp([], 'notes')
    for (const id of ['agenda', 'grades', 'habits', 'journal', 'files', 'study', 'darts', 'weather', 'clock'] as const) list = pushRecentApp(list, id)
    expect(list).toHaveLength(MAX_RECENT_APPS)
    expect(list[0]).toBe('clock')
    expect(list).not.toContain('notes')
  })

  it('leest alleen geldige ids uit de opslag', () => {
    expect(parseRecentApps(null)).toEqual([])
    expect(parseRecentApps({ notes: 1 })).toEqual([])
    expect(parseRecentApps(['notes', 3, 'Notes!', 'notes', 'agenda'])).toEqual(['notes', 'agenda'])
  })
})
