import { describe, expect, it } from 'vitest'
import { formatBytes, isQuotaError, storageSummary } from './storageHealth'

describe('formatBytes', () => {
  it('uses nl-BE decimals and steps of 1000', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(12_345_678)).toBe('12,3 MB')
    expect(formatBytes(2_000_000_000)).toBe('2 GB')
    expect(formatBytes(-5)).toBe('0 B')
  })
})

describe('isQuotaError', () => {
  it('recognises full storage in every browser', () => {
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true)
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true)
    expect(isQuotaError({ name: 'Error', code: 22 })).toBe(true)
    expect(isQuotaError({ name: 'Error', code: 1014 })).toBe(true)
  })
  it('ignores other errors, such as storage blocked in private mode', () => {
    expect(isQuotaError({ name: 'SecurityError', code: 18 })).toBe(false)
    expect(isQuotaError(new Error('x'))).toBe(false)
    expect(isQuotaError(null)).toBe(false)
  })
})

describe('storageSummary', () => {
  it('says how much is used and that the browser keeps it', () => {
    const s = storageSummary({ usage: 12_345_678, quota: 2_000_000_000, persisted: true, fullAt: null })
    expect(s.level).toBe('ok')
    expect(s.usedText).toBe('12,3 MB van 2 GB')
    expect(s.detail).toContain('bewaart alles')
  })
  it('warns from 90% on', () => {
    expect(storageSummary({ usage: 95, quota: 100, persisted: false, fullAt: null }).level).toBe('warn')
    expect(storageSummary({ usage: 89, quota: 100, persisted: false, fullAt: null }).level).toBe('ok')
  })
  it('a failed save wins over everything else', () => {
    const s = storageSummary({ usage: 10, quota: 100, persisted: true, fullAt: 1 })
    expect(s.level).toBe('full')
    expect(s.title).toBe('Opslaan op dit toestel lukte niet')
  })
  it('is honest when the browser does not say', () => {
    const s = storageSummary({ usage: null, quota: 0, persisted: null, fullAt: null })
    expect(s.level).toBe('unknown')
    expect(s.ratio).toBeNull()
    expect(s.detail).toBe('Je browser zegt niet hoeveel ruimte er is.')
  })
})
