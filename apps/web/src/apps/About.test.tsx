import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CHANGELOG } from '../about/changelog'
import { About } from './About'

describe('Over NEXUS', () => {
  afterEach(cleanup)

  it('shows what is new, newest first, and can show everything', () => {
    render(<About />)
    expect(screen.getByRole('heading', { name: 'Wat is er nieuw' })).toBeTruthy()
    expect(screen.getByText(CHANGELOG[0].title)).toBeTruthy()
    const last = CHANGELOG[CHANGELOG.length - 1].title
    expect(screen.queryByText(last)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: `Alles tonen (${CHANGELOG.length})` }))
    expect(screen.getByText(last)).toBeTruthy()
  })
})
