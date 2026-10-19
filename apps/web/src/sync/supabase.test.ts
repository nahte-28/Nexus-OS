import { describe, expect, it } from 'vitest'
import { normalizeSupabaseUrl } from './supabase'

describe('normalizeSupabaseUrl', () => {
  it('strips API paths and trailing slashes copied from the dashboard', () => {
    expect(normalizeSupabaseUrl('https://abc.supabase.co/rest/v1/')).toBe('https://abc.supabase.co')
    expect(normalizeSupabaseUrl(' https://abc.supabase.co/ ')).toBe('https://abc.supabase.co')
    expect(normalizeSupabaseUrl('https://abc.supabase.co')).toBe('https://abc.supabase.co')
    expect(normalizeSupabaseUrl('"https://abc.supabase.co/rest/v1/"')).toBe('https://abc.supabase.co')
    expect(normalizeSupabaseUrl('')).toBeUndefined()
  })
})
