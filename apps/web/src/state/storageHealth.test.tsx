import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StorageNotice } from '../shell/StorageNotice'
import { writeStorage } from './storage'
import { resetStorageHealth } from './storageHealth'

function failingSetItem(name: string) {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', name)
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
  resetStorageHealth()
})

describe('saving on this device', () => {
  it('returns true when it worked', () => {
    expect(writeStorage('nexus.test', '1')).toBe(true)
  })

  it('shows a notice when storage is full, instead of losing the change silently', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<StorageNotice bottom={8} />)
    expect(screen.queryByRole('alert')).toBeNull()
    failingSetItem('QuotaExceededError')
    act(() => {
      expect(writeStorage('nexus.test', 'x'.repeat(10))).toBe(false)
    })
    expect(screen.getByRole('alert').textContent).toContain('Opslaan lukte niet')
    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))
    expect(screen.queryByRole('alert')).toBeNull()
    // Still full: the next failed save does not bring it back right away.
    act(() => {
      writeStorage('nexus.test', 'y')
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('stays quiet when storage is blocked (private mode)', () => {
    render(<StorageNotice bottom={8} />)
    failingSetItem('SecurityError')
    act(() => {
      expect(writeStorage('nexus.test', '1')).toBe(false)
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
