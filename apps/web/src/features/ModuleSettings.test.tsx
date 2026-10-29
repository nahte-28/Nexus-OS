import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ModuleSettings } from './ModuleSettings'

describe('ModuleSettings', () => {
  afterEach(cleanup)

  it('lists every blueprint module, all of them built and off until you switch them on', () => {
    render(<ModuleSettings />)
    const devHub = screen.getByRole('checkbox', { name: /Developer Hub/ }) as HTMLInputElement
    expect(devHub.disabled).toBe(false)
    expect(devHub.checked).toBe(false)
    const spaces = screen.getByRole('checkbox', { name: /^Spaces/ }) as HTMLInputElement
    expect(spaces.disabled).toBe(false)
    expect(spaces.checked).toBe(false)
    expect(screen.queryAllByText('binnenkort')).toHaveLength(0)
    expect(screen.getByText('Wat dit toestel kan')).toBeTruthy()
  })
})
