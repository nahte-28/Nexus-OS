import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { setOwnKeyVault, type OwnKeyVault } from './ownKey'
import { OwnKeySettings } from './OwnKeySettings'

describe('Eigen sleutel', () => {
  afterEach(cleanup)

  it('bewaart een sleutel, toont alleen het einde en verwijdert hem', async () => {
    let value: Parameters<OwnKeyVault['save']>[0] | undefined
    setOwnKeyVault({ load: async () => value, save: async (v) => void (value = v), clear: async () => void (value = undefined) })
    render(<OwnKeySettings />)
    expect(await screen.findByText(/nog geen eigen sleutel/)).toBeTruthy()
    const field = screen.getByLabelText('Sleutel') as HTMLInputElement
    expect(field.type).toBe('password')
    fireEvent.change(field, { target: { value: 'sk-ant-api03-' + 'z'.repeat(30) + 'wxyz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Bewaren' }))
    expect(await screen.findByText('sk-ant-…wxyz')).toBeTruthy()
    expect(screen.queryByDisplayValue(/sk-ant/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Verwijderen' }))
    expect(await screen.findByText(/van dit apparaat verwijderd/)).toBeTruthy()
  })
})
