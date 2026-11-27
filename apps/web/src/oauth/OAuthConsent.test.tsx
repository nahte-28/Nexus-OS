import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const oauth = {
  getAuthorizationDetails: vi.fn(),
  approveAuthorization: vi.fn(),
  denyAuthorization: vi.fn(),
}
let session: object | null = { user: { id: 'u1' } }
vi.mock('../sync/config', () => ({
  loadSupabase: () => Promise.resolve({ auth: { getSession: () => Promise.resolve({ data: { session } }), oauth } }),
}))

const { OAuthConsent } = await import('./OAuthConsent')
const { takePendingConsent } = await import('./pending')

const assign = vi.fn()
beforeEach(() => {
  vi.stubGlobal('location', { ...window.location, search: '?authorization_id=abc123', assign })
  session = { user: { id: 'u1' } }
  oauth.getAuthorizationDetails.mockResolvedValue({
    data: { authorization_id: 'abc123', redirect_uri: 'https://claude.ai/api/mcp/auth_callback', client: { id: 'c1', name: 'Claude', uri: '', logo_uri: '' }, user: { id: 'u1', email: 'ethan@example.com' }, scope: 'email' },
    error: null,
  })
  oauth.approveAuthorization.mockResolvedValue({ data: { redirect_url: 'https://claude.ai/api/mcp/auth_callback?code=x' }, error: null })
  oauth.denyAuthorization.mockResolvedValue({ data: { redirect_url: 'https://claude.ai/api/mcp/auth_callback?error=access_denied' }, error: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  assign.mockReset()
  sessionStorage.clear()
})

describe('OAuthConsent', () => {
  it('names the assistant and where you go back to, and sends you back with a code on Toestaan', async () => {
    render(<OAuthConsent />)
    expect(await screen.findByRole('heading', { name: 'Claude wil NEXUS gebruiken' })).toBeTruthy()
    expect(screen.getByText('claude.ai')).toBeTruthy()
    expect(screen.getByText('ethan@example.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Toestaan' }))
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=x'))
    expect(oauth.approveAuthorization).toHaveBeenCalledWith('abc123', { skipBrowserRedirect: true })
  })

  it('refuses on Weigeren', async () => {
    render(<OAuthConsent />)
    fireEvent.click(await screen.findByRole('button', { name: 'Weigeren' }))
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?error=access_denied'))
    expect(oauth.approveAuthorization).not.toHaveBeenCalled()
  })

  it('asks you to sign in first and keeps the request for afterwards', async () => {
    session = null
    render(<OAuthConsent />)
    fireEvent.click(await screen.findByRole('button', { name: 'Inloggen in NEXUS' }))
    expect(assign).toHaveBeenCalledWith('/')
    expect(takePendingConsent()).toBe('abc123')
  })

  it('goes straight back when you allowed this assistant before', async () => {
    oauth.getAuthorizationDetails.mockResolvedValue({ data: { redirect_url: 'https://claude.ai/back?code=y' }, error: null })
    render(<OAuthConsent />)
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/back?code=y'))
  })
})

describe('pending consent', () => {
  it('drops a request older than 10 minutes and odd ids', async () => {
    const { savePendingConsent } = await import('./pending')
    savePendingConsent('abc', 0)
    expect(takePendingConsent(11 * 60_000)).toBeNull()
    savePendingConsent('abc', 0)
    expect(takePendingConsent(60_000)).toBe('abc')
    expect(takePendingConsent(60_000)).toBeNull()
    savePendingConsent('a b"<', 0)
    expect(takePendingConsent(1)).toBeNull()
  })
})
