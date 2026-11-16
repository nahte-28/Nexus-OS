import { env } from './_shared.js'

/**
 * Snel antwoorden: the service worker on the phone posts here when you tap Oké 👍 or Ik reageer
 * straks on a notice for a privébericht or a teamchat message. The one-time token came only with
 * that notice; the database checks it (public.message_reply_keys and public.message_reply in
 * supabase/migrations/20261116090000_message_push.sql). A privébericht answer arrives already
 * sealed for every device of both people, so this function never sees its text. Same origin as
 * NEXUS itself, so no CORS headers.
 */
const ANSWERS = new Set(['verstuurd', 'onbekend', 'ongeldig', 'te vaak'])
const TOKEN = /^[0-9a-f]{64}$/

type Body = { step: 'keys'; token: string } | { step: 'send'; token: string; text: string; envelopes: Record<string, unknown> | null }

export function validReply(value: unknown): value is Body {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.token !== 'string' || !TOKEN.test(v.token)) return false
  if (v.step === 'keys') return true
  if (v.step !== 'send' || typeof v.text !== 'string' || v.text.trim().length === 0 || v.text.length > 200) return false
  if (v.envelopes === null || v.envelopes === undefined) return true
  if (typeof v.envelopes !== 'object' || Array.isArray(v.envelopes)) return false
  const entries = Object.entries(v.envelopes as Record<string, unknown>)
  return (
    entries.length > 0 &&
    entries.length <= 22 &&
    entries.every(([id, e]) => {
      const env = e as Record<string, unknown> | null
      return /^[0-9a-f-]{36}$/.test(id) && !!env && typeof env.ephemeralKey === 'string' && typeof env.iv === 'string' && typeof env.ciphertext === 'string' && env.ciphertext.length <= 4000
    })
  )
}

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export async function POST(request: Request): Promise<Response> {
  const url = env('VITE_SUPABASE_URL')?.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '')
  const key = env('VITE_SUPABASE_ANON_KEY')
  if (!url || !key) return reply(503, { result: 'niet ingesteld' })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return reply(400, { result: 'ongeldig' })
  }
  if (!validReply(body)) return reply(400, { result: 'ongeldig' })
  const rpc = (name: string, args: unknown) =>
    fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(args) })

  if (body.step === 'keys') {
    const response = await rpc('message_reply_keys', { p_token: body.token })
    if (!response.ok) return reply(response.status === 404 ? 501 : 502, { result: response.status === 404 ? 'database niet bijgewerkt' : 'database' })
    const keys = (await response.json()) as unknown
    return keys ? reply(200, keys) : reply(409, { result: 'onbekend' })
  }
  const response = await rpc('message_reply', { p_token: body.token, p_text: body.text, p_envelopes: body.envelopes ?? null })
  if (!response.ok) return reply(response.status === 404 ? 501 : 502, { result: response.status === 404 ? 'database niet bijgewerkt' : 'database' })
  const result: unknown = await response.json()
  const text = typeof result === 'string' && ANSWERS.has(result) ? result : 'onbekend'
  return reply(text === 'verstuurd' ? 200 : 409, { result: text })
}
