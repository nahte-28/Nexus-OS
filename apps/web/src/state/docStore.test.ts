import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { pullSetting } from './docStore'

function client(rows: Array<{ key: string; value: unknown; revision: number }>, error: unknown = null) {
  const inFn = vi.fn(async (_col: string, keys: string[]) => ({ data: rows.filter((r) => keys.includes(r.key)), error }))
  const select = vi.fn(() => ({ in: inFn }))
  const from = vi.fn(() => ({ select }))
  return { c: { from } as unknown as SupabaseClient, from, inFn }
}

describe('docStore', () => {
  it('reads documents asked for together in one request', async () => {
    const { c, from, inFn } = client([{ key: 'grades', value: { a: 1 }, revision: 3 }])
    const [grades, habits, again] = await Promise.all([pullSetting(c, 'grades'), pullSetting(c, 'habits'), pullSetting(c, 'grades')])
    expect(from).toHaveBeenCalledTimes(1)
    expect(inFn).toHaveBeenCalledWith('key', ['grades', 'habits'])
    expect(grades).toEqual({ value: { a: 1 }, revision: 3 })
    expect(again).toEqual(grades)
    expect(habits).toBeNull()
    // A later pull is a new request.
    await pullSetting(c, 'habits')
    expect(from).toHaveBeenCalledTimes(2)
  })

  it('passes an error to everyone who waited', async () => {
    const { c } = client([], { message: 'stuk' })
    await expect(Promise.all([pullSetting(c, 'a'), pullSetting(c, 'b')])).rejects.toEqual({ message: 'stuk' })
  })
})
