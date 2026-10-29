import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SyncEngine } from '../sync/engine'
import { SyncProvider } from '../sync/SyncContext'
import { Account } from './Account'

function fakeEngine() {
  const state = { status: 'signed-out' as const, email: null, lastSyncedAt: null, pending: 0, error: null }
  return {
    start: () => () => {},
    subscribe: () => () => {},
    getSnapshot: () => state,
    signIn: vi.fn(async () => {}),
    signInWithPassword: vi.fn(async () => {}),
    signUp: vi.fn(async () => ({ needsConfirmation: false })),
  } as unknown as SyncEngine & { signIn: ReturnType<typeof vi.fn> }
}

describe('Account', () => {
  afterEach(cleanup)

  it('only offers passwords, with a link for a forgotten one', async () => {
    const engine = fakeEngine()
    render(
      <SyncProvider engine={engine}>
        <Account />
      </SyncProvider>,
    )
    expect(screen.queryByRole('tab', { name: 'Inloglink' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Wachtwoord vergeten?' }))
    expect(screen.getByRole('alert').textContent).toMatch(/e-mailadres/)
    expect(engine.signIn).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('E-mailadres'), { target: { value: 'ethan@voorbeeld.be' } })
    fireEvent.click(screen.getByRole('button', { name: 'Wachtwoord vergeten?' }))
    expect(await screen.findByText(/stuurden een link naar ethan@voorbeeld.be/)).toBeTruthy()
    expect(engine.signIn).toHaveBeenCalledWith('ethan@voorbeeld.be')
  })
})
