import { beforeEach, describe, expect, it } from 'vitest'
import { mergeGrades, parseGradesState, type Course, type GradesState } from '@nexus/core'
import { DocStore, syncDoc, type DocRemote } from '../state/docStore'

const course = (id: string, name: string, updatedAt: number): Course => ({ id, name, credits: 6, target: 10, parts: [], updatedAt, deletedAt: null })

/** One user_settings row, with the server's rule that only a newer revision is written. */
function fakeRemote(initial: GradesState | null = null) {
  let row = initial
  const remote: DocRemote<GradesState> = {
    pull: async () => row,
    push: async (state) => {
      if (row && state.revision <= row.revision) return false
      row = structuredClone(state)
      return true
    },
  }
  return { remote, row: () => row }
}

describe('Cijfers on this device and the account', () => {
  beforeEach(() => localStorage.clear())

  it('keeps marks offline and merges two devices course by course', async () => {
    const pc = new DocStore('nexus.grades', parseGradesState)
    pc.update((s) => ({ ...s, courses: [course('a', 'Elektronica', 1)] }))
    expect(new DocStore('nexus.grades', parseGradesState).getSnapshot().courses).toHaveLength(1)

    const { remote, row } = fakeRemote()
    expect(await syncDoc(pc, remote, mergeGrades)).toBe(1)
    expect(row()?.courses.map((c) => c.name)).toEqual(['Elektronica'])

    // The phone added another course offline; after syncing both devices have both.
    localStorage.clear()
    const phone = new DocStore('nexus.grades', parseGradesState)
    phone.update((s) => ({ ...s, courses: [course('b', 'Wiskunde', 2)] }))
    await syncDoc(phone, remote, mergeGrades)
    expect(phone.getSnapshot().courses.map((c) => c.name).sort()).toEqual(['Elektronica', 'Wiskunde'])
    await syncDoc(pc, remote, mergeGrades)
    expect(pc.getSnapshot().courses.map((c) => c.name).sort()).toEqual(['Elektronica', 'Wiskunde'])
    expect(pc.getSnapshot().revision).toBe(row()?.revision)

    // Nothing changed: no new revision.
    const before = row()?.revision
    await syncDoc(pc, remote, mergeGrades)
    expect(row()?.revision).toBe(before)
  })
})
