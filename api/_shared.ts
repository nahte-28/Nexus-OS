import Anthropic from '@anthropic-ai/sdk'

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
    'Access-Control-Allow-Headers': 'authorization, content-type, x-nexus-ai-key',
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
 * Someone's own Anthropic key, sent along with each request from their own device. It is used for
 * that one request and never stored or logged here.
 */
export const OWN_KEY_HEADER = 'x-nexus-ai-key'
const OWN_KEY = /^sk-ant-[A-Za-z0-9_-]{20,300}$/

export function ownKey(request: Request): string | null {
  const key = request.headers.get(OWN_KEY_HEADER)?.trim()
  return key && OWN_KEY.test(key) ? key : null
}

/** The key that pays for this request: the person's own, else the server's. */
export function aiKey(request: Request): string | undefined {
  return ownKey(request) ?? env('ANTHROPIC_API_KEY')
}

/** A Dutch message for an error of the AI service; with an own key, says it is about that key. */
export function aiErrorText(err: unknown, request: Request): string {
  const own = ownKey(request) !== null
  if (err instanceof Anthropic.AuthenticationError) return own ? 'Je eigen AI-sleutel werkt niet. Kijk hem na in NEXUS AI › Eigen sleutel.' : 'De Anthropic-sleutel op de server is ongeldig.'
  if (err instanceof Anthropic.PermissionDeniedError && own) return 'Je eigen AI-sleutel mag dit model niet gebruiken. Kijk je account na op console.anthropic.com.'
  if (err instanceof Anthropic.RateLimitError) return own ? 'Even te veel aanvragen op je eigen sleutel, of je tegoed is op. Probeer het zo opnieuw.' : 'Even te veel aanvragen. Probeer het zo opnieuw.'
  if (err instanceof Anthropic.BadRequestError) return /credit balance/i.test(err.message) && own ? 'Het tegoed van je eigen AI-sleutel is op. Vul het aan op console.anthropic.com.' : `De AI weigerde de aanvraag: ${err.message}`
  if (err instanceof Anthropic.APIError) return `De AI-dienst gaf een fout (${err.status ?? 'netwerk'}).`
  return 'De AI is niet bereikbaar.'
}

/**
 * Checks that NEXUS AI is set up and that the request comes from an allowed account.
 * Returns the response to send when it does not, or null when the request may go on.
 */
export async function aiAccess(request: Request): Promise<Response | null> {
  const own = request.headers.get(OWN_KEY_HEADER)?.trim()
  if (own && !ownKey(request)) return json(request, 400, 'Je eigen AI-sleutel ziet er niet uit als een Anthropic-sleutel (sk-ant-...).')
  if (!own && (!env('ANTHROPIC_API_KEY') || allowedEmails(process.env.NEXUS_AI_ALLOWED_EMAILS).size === 0)) {
    return json(request, 503, 'NEXUS AI heeft hier geen gedeelde sleutel. Zet je eigen AI-sleutel in NEXUS AI › Eigen sleutel.')
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
  // With your own key you pay yourself, so any signed-in account may use it.
  if (own) return null
  if (!allowedEmails(process.env.NEXUS_AI_ALLOWED_EMAILS).has(email)) return json(request, 403, 'De gedeelde AI-sleutel is niet voor dit account. Zet je eigen AI-sleutel in NEXUS AI › Eigen sleutel.')
  return null
}
