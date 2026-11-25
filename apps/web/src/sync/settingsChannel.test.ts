import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { changedSettingKey, watchSetting } from './settingsChannel'

function fakeClient() {
  let listener: ((payload: unknown) => void) | null = null
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, cb: (payload: unknown) => void) => {
      listener = cb
      return channel
    }),
    subscribe: vi.fn(() => channel),
  }
  const client = { channel: vi.fn(() => channel), removeChannel: vi.fn(() => Promise.resolve('ok')) }
  return { client: client as unknown as SupabaseClient, raw: client, emit: (payload: unknown) => listener?.(payload) }
}

describe('settings channel', () => {
  it('reads the key from new or old values', () => {
    expect(changedSettingKey({ new: { key: 'grades' } })).toBe('grades')
    expect(changedSettingKey({ new: {}, old: { key: 'habits' } })).toBe('habits')
    expect(changedSettingKey({ new: {}, old: {} })).toBeNull()
    expect(changedSettingKey(null)).toBeNull()
  })

  it('uses one channel and wakes only the document that changed', () => {
    const { client, raw, emit } = fakeClient()
    const grades = vi.fn()
    const habits = vi.fn()
    watchSetting(client, 'grades', grades)
    watchSetting(client, 'habits', habits)
    expect(raw.channel).toHaveBeenCalledTimes(1)
    emit({ eventType: 'UPDATE', new: { key: 'grades', revision: 4 } })
    expect(grades).toHaveBeenCalledTimes(1)
    expect(habits).not.toHaveBeenCalled()
  })

  it('wakes every document when the payload has no key', () => {
    const { client, emit } = fakeClient()
    const a = vi.fn()
    const b = vi.fn()
    watchSetting(client, 'a', a)
    watchSetting(client, 'b', b)
    emit({ eventType: 'DELETE', old: {} })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('closes the channel when the last document stops watching, and opens a new one later', () => {
    const { client, raw } = fakeClient()
    const stopA = watchSetting(client, 'a', () => {})
    const stopB = watchSetting(client, 'b', () => {})
    stopA()
    expect(raw.removeChannel).not.toHaveBeenCalled()
    stopB()
    expect(raw.removeChannel).toHaveBeenCalledTimes(1)
    watchSetting(client, 'a', () => {})
    expect(raw.channel).toHaveBeenCalledTimes(2)
  })
})
