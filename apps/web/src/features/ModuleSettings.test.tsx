import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ModuleSettings } from './ModuleSettings'

describe('ModuleSettings', () => {
  afterEach(cleanup)

  it('lists every blueprint module, and modules not built yet cannot be switched on', () => {
    render(<ModuleSettings />)
    const devHub = screen.getByRole('checkbox', { name: /Developer Hub/ }) as HTMLInputElement
    expect(devHub.disabled).toBe(true)
    const spaces = screen.getByRole('checkbox', { name: /^Spaces/ }) as HTMLInputElement
    expect(spaces.disabled).toBe(false)
    expect(spaces.checked).toBe(false)
    expect(screen.getAllByText('binnenkort')).toHaveLength(1)
    expect(screen.getByText('Wat dit toestel kan')).toBeTruthy()
  })
})
