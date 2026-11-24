import { describe, expect, it } from 'vitest'
import type { AppId } from '@nexus/core'
import { mostUsed } from './usage'

const apps = (['notes', 'agenda', 'habits', 'grades'] as AppId[]).map((id) => ({ id }))

describe('mostUsed', () => {
  it('puts what you open most first, skips what you never opened and keeps the given order on a tie', () => {
    expect(mostUsed({ habits: 5, agenda: 2, grades: 2 }, apps, 8).map((a) => a.id)).toEqual(['habits', 'agenda', 'grades'])
    expect(mostUsed({ habits: 5, agenda: 2, grades: 2 }, apps, 2).map((a) => a.id)).toEqual(['habits', 'agenda'])
    expect(mostUsed({}, apps, 8)).toEqual([])
  })
})
