import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CHANGELOG } from '../about/changelog'
import { entryKey } from '../about/seen'

const opened: string[] = []
vi.mock('./openApp', () => ({ openApp: (app: string) => opened.push(app) }))
const { WhatsNew } = await import('./WhatsNew')

describe('NEXUS is bijgewerkt', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('stays away on a first run', () => {
    render(<WhatsNew bottom={8} />)
    expect(screen.queryByRole('region', { name: 'NEXUS is bijgewerkt' })).toBeNull()
  })

  it('shows what is new once after an update and opens Over NEXUS', () => {
    const older = CHANGELOG[1]
    localStorage.setItem('nexus.changelog.seen', JSON.stringify({ key: entryKey(older), date: older.date }))
    render(<WhatsNew bottom={8} />)
    expect(screen.getByRole('region', { name: 'NEXUS is bijgewerkt' })).toBeTruthy()
    expect(screen.getByText(CHANGELOG[0].title)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Wat is er nieuw' }))
    expect(opened).toEqual(['about'])
    cleanup()
    render(<WhatsNew bottom={8} />)
    expect(screen.queryByRole('region', { name: 'NEXUS is bijgewerkt' })).toBeNull()
  })
})
