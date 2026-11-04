import { env } from './_shared.js'

/**
 * Meldingsknoppen: the service worker on the phone posts here when you tap Klaar or Later on a
 * notice. The token travels only inside the encrypted notice; the database checks it against the
 * hash the pc stored (public.push_action in supabase/migrations/20261103150000_push_actions.sql)
 * and does the rest. Same origin as NEXUS itself, so no CORS headers.
 */
const ANSWERS = new Set(['klaar', 'later', 'te vaak', 'onbekend', 'ongeldig'])

export function validAction(value: unknown): value is { ref: string; token: string; action: 'done' | 'later' } {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.ref === 'string' &&
    v.ref.length > 0 &&
    v.ref.length <= 300 &&
    typeof v.token === 'string' &&
    /^[A-Za-z0-9_-]{20,100}$/.test(v.token) &&
    (v.action === 'done' || v.action === 'later')
  )
}

const reply = (status: number, result: string) => new Response(JSON.stringify({ result }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export async function POST(request: Request): Promise<Response> {
  const url = env('VITE_SUPABASE_URL')?.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '')
  const key = env('VITE_SUPABASE_ANON_KEY')
  if (!url || !key) return reply(503, 'niet ingesteld')
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return reply(400, 'ongeldig')
  }
  if (!validAction(body)) return reply(400, 'ongeldig')
  const response = await fetch(`${url}/rest/v1/rpc/push_action`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_ref: body.ref, p_token: body.token, p_action: body.action }),
  })
  if (!response.ok) return reply(response.status === 404 ? 501 : 502, response.status === 404 ? 'database niet bijgewerkt' : 'database')
  const result: unknown = await response.json()
  const text = typeof result === 'string' && ANSWERS.has(result) ? result : 'onbekend'
  return reply(text === 'klaar' || text === 'later' ? 200 : 409, text)
}
