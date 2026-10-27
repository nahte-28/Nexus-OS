/** Helpers shared by the NEXUS server functions. Files starting with _ are not routes on Vercel. */

/** The Claude model NEXUS AI uses unless NEXUS_AI_MODEL says otherwise. */
export const DEFAULT_MODEL = 'claude-opus-5-5'

/** Origins of the Windows app (and local development) that may call this endpoint. */
const ALLOWED_ORIGINS = new Set(['http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost', 'http://localhost:5173'])

export function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin')
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function json(request: Request, status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json', ...cors(request) },
  })
}

export function env(name: string): string | undefined {
  const value = process.env[name]?.trim().replace(/^["']|["']$/g, '').trim()
  return value || undefined
}

/** Asks Supabase who the token belongs to; null when it is not a valid login. */
export async function emailForToken(token: string): Promise<string | null> {
  const url = env('VITE_SUPABASE_URL')?.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '')
  const key = env('VITE_SUPABASE_ANON_KEY')
  if (!url || !key) throw new Error('Supabase is niet ingesteld op de server.')
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } })
  if (!response.ok) return null
  const user = (await response.json()) as { email?: string }
  return user.email?.toLowerCase() ?? null
}

export function allowedEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * Checks that NEXUS AI is set up and that the request comes from an allowed account.
 * Returns the response to send when it does not, or null when the request may go on.
 */
export async function aiAccess(request: Request): Promise<Response | null> {
  if (!env('ANTHROPIC_API_KEY') || allowedEmails(process.env.NEXUS_AI_ALLOWED_EMAILS).size === 0) {
    return json(request, 503, 'NEXUS AI is nog niet ingesteld: zet ANTHROPIC_API_KEY en NEXUS_AI_ALLOWED_EMAILS in Vercel.')
  }
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json(request, 401, 'Meld je aan om NEXUS AI te gebruiken.')
  let email: string | null
  try {
    email = await emailForToken(token)
  } catch (err) {
    return json(request, 503, err instanceof Error ? err.message : 'Aanmelding controleren mislukt.')
  }
  if (!email) return json(request, 401, 'Je sessie is verlopen. Meld je opnieuw aan.')
  if (!allowedEmails(process.env.NEXUS_AI_ALLOWED_EMAILS).has(email)) return json(request, 403, 'Dit account mag NEXUS AI niet gebruiken.')
  return null
}
