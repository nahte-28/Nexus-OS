import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { defaultProfilesState } from '@nexus/core'
import { AboutMe } from './AboutMe'
import { profilesStore } from './store'

describe('Over jou', () => {
  afterEach(() => {
    cleanup()
    profilesStore.update(() => defaultProfilesState())
  })

  it('saves your name and turns School into Werk when you work', () => {
    render(<AboutMe />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Je naam' }), { target: { value: 'Marc' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Ik werk' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Je werk' }), { target: { value: 'Bakkerij' } })
    const { about, profiles } = profilesStore.getSnapshot().state
    expect(about).toMatchObject({ name: 'Marc', role: 'work', place: 'Bakkerij' })
    expect(profiles.school.name).toBe('Werk')
    expect(screen.getByText(/Je eerste profiel heet nu Werk/)).toBeTruthy()
  })
})
