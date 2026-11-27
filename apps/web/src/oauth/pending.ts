/**
 * An assistant (Claude, ...) asked to connect while you were not signed in: the consent screen
 * keeps its request here, you sign in in NEXUS, and NEXUS goes back to the consent screen. A
 * request is only good for 10 minutes on the Supabase side, so an older one is dropped.
 */
const KEY = 'nexus.oauth.pending'
const MAX_AGE_MS = 10 * 60_000

export const CONSENT_PATH = '/oauth/consent'

export function consentUrl(authorizationId: string): string {
  return `${CONSENT_PATH}?authorization_id=${encodeURIComponent(authorizationId)}`
}

export function savePendingConsent(authorizationId: string, now = Date.now()): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ id: authorizationId, at: now }))
  } catch {
    // No session storage: you open the link from the assistant again after signing in.
  }
}

/** The waiting request, taken out; null when there is none or it is too old. */
export function takePendingConsent(now = Date.now()): string | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as { id?: unknown; at?: unknown }) : null
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.at !== 'number' || now - parsed.at > MAX_AGE_MS) return null
    return /^[A-Za-z0-9_-]{1,200}$/.test(parsed.id) ? parsed.id : null
  } catch {
    return null
  }
}

export function hasPendingConsent(): boolean {
  try {
    return sessionStorage.getItem(KEY) !== null
  } catch {
    return false
  }
}

/** After signing in, back to the consent screen of the waiting request. */
export async function resumePendingConsent(): Promise<void> {
  const { loadSupabase } = await import('../sync/config')
  const client = await loadSupabase()
  if (!client) return
  const go = () => {
    const id = takePendingConsent()
    if (id) window.location.assign(consentUrl(id))
  }
  const { data } = await client.auth.getSession()
  if (data.session) return go()
  // Not signed in yet: show Account, where you sign in.
  const { openAppWhenReady } = await import('../shell/openApp')
  openAppWhenReady('account')
  const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
    if (!session) return
    sub.subscription.unsubscribe()
    go()
  })
}
