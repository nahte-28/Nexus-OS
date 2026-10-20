/** Helpers shared by the NEXUS server functions. Files starting with _ are not routes on Vercel. */

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
