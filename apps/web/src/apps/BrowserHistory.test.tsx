import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const opened: string[] = []
vi.mock('../platform/desktop', () => ({ isDesktopApp: true, openWebApp: vi.fn() }))
vi.mock('../browser/bridge', () => ({ openInNexusBrowser: (url: string) => opened.push(url) }))
const { Browser } = await import('./Browser')
const { browserHistory } = await import('../browser/history')

describe('Browser history in the Windows app', () => {
  afterEach(() => {
    cleanup()
    browserHistory.clear()
  })

  it('lists, searches, opens, forgets and clears visited pages', () => {
    browserHistory.visit('https://vrt.be/', 'VRT NWS', 1000)
    browserHistory.visit('https://ap.be/', 'AP Hogeschool', 2000)
    render(<Browser />)
    expect(screen.getByRole('heading', { name: 'Geschiedenis' })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Geschiedenis doorzoeken' }), { target: { value: 'nws' } })
    expect(screen.queryByText(/AP Hogeschool/)).toBeNull()
    fireEvent.click(screen.getByText(/VRT NWS/))
    expect(opened).toEqual(['https://vrt.be/'])
    fireEvent.click(screen.getByRole('button', { name: 'VRT NWS uit de geschiedenis halen' }))
    expect(browserHistory.get().map((v) => v.url)).toEqual(['https://ap.be/'])
    fireEvent.click(screen.getByRole('button', { name: 'Geschiedenis wissen' }))
    expect(screen.getByText(/komen hier/)).toBeTruthy()
  })
})
