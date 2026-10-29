import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { APPS } from './registry'
import { Help } from './Help'
import { HELP } from '../help/topics'

describe('Help', () => {
  afterEach(cleanup)

  it('has an explanation for every app', () => {
    for (const app of APPS) expect(HELP[app.id].summary.length).toBeGreaterThan(0)
  })

  it('finds apps by a word in their explanation', () => {
    render(<Help />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Zoeken in Help' }), { target: { value: 'pomodoro' } })
    expect(screen.getByText('Studie')).toBeTruthy()
    expect(screen.queryByText('Financiën')).toBeNull()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Zoeken in Help' }), { target: { value: 'xyzzy' } })
    expect(screen.getByText(/Niets gevonden/)).toBeTruthy()
  })
})
