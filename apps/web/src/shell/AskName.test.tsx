import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AskName } from './AskName'

function fake(profile: { displayName: string; code: string } | null) {
  return {
    me: vi.fn(async () => ({ id: `u-${Math.random()}`, email: 'a@b.be' })),
    profile: vi.fn(async () => profile),
    setName: vi.fn(async (name: string) => ({ displayName: name, code: 'ABCDEFGH' })),
  }
}

describe('AskName', () => {
  afterEach(cleanup)

  it('asks a name when you have none, and saves it', async () => {
    const api = fake(null)
    render(<AskName api={api} />)
    const box = await screen.findByRole('textbox', { name: 'Je naam' })
    fireEvent.change(box, { target: { value: 'Lotte' } })
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    await waitFor(() => expect(api.setName).toHaveBeenCalledWith('Lotte'))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Kies je naam' })).toBeNull())
  })

  it('stays away when you already have a name', async () => {
    const api = fake({ displayName: 'Ethan', code: 'ABCDEFGH' })
    render(<AskName api={api} />)
    await waitFor(() => expect(api.profile).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'Kies je naam' })).toBeNull()
  })

  it('does not ask again on this device after Later', async () => {
    const api = fake(null)
    api.me.mockResolvedValue({ id: 'u-later', email: 'a@b.be' })
    render(<AskName api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Later' }))
    cleanup()
    render(<AskName api={api} />)
    await waitFor(() => expect(api.me).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('region', { name: 'Kies je naam' })).toBeNull()
  })
})
