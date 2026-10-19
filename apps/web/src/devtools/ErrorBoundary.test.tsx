import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function Broken(): never {
  throw new Error('kapot')
}

describe('ErrorBoundary', () => {
  afterEach(cleanup)

  it('shows the error instead of blanking the screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary name="NEXUS AI">
        <Broken />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert').textContent).toContain('NEXUS AI liep vast.')
    expect(screen.getByRole('alert').textContent).toContain('kapot')
  })
})
