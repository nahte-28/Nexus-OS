import webpush from 'web-push'
import { cors, env, json } from './_shared.js'

/**
 * Wakes phones that run NEXUS in Chrome. Every minute the database (pg_cron, see
 * supabase/migrations/20261021100000_push.sql) posts here what is due; each payload is already
 * encrypted for its phone, so this function only signs and forwards it. GET gives the public key a
 * browser needs to subscribe.
 *
 * Vercel environment variables:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   the key pair (the Developer app makes one)
 *   PUSH_SECRET                            the same secret as in nexus_private.push_config
 *   VAPID_SUBJECT                          optional, a mailto: or https: address for push services
 */

const MAX_PUSHES = 200

interface Push {
  endpoint: string
  p256dh: string
  auth: string
  payload: unknown
}

export function validPush(value: unknown): value is Push {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return (
    typeof p.endpoint === 'string' &&
    p.endpoint.startsWith('https://') &&
    p.endpoint.length <= 1000 &&
    typeof p.p256dh === 'string' &&
    typeof p.auth === 'string' &&
    !!p.payload &&
    typeof p.payload === 'object'
  )
}

/** Compares without leaking how much of the secret matched. */
export function sameSecret(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: { ...cors(request), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } })
}

export function GET(request: Request): Response {
  const publicKey = env('VAPID_PUBLIC_KEY')
  if (!publicKey) return json(request, 503, 'Web-push is nog niet ingesteld op de server. Zie de Developer-app.')
  return new Response(JSON.stringify({ publicKey }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(request) },
  })
}

export async function POST(request: Request): Promise<Response> {
  const secret = env('PUSH_SECRET')
  const publicKey = env('VAPID_PUBLIC_KEY')
  const privateKey = env('VAPID_PRIVATE_KEY')
  if (!secret || !publicKey || !privateKey) return json(request, 503, 'Web-push is nog niet ingesteld op de server.')
  const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!sameSecret(given, secret)) return json(request, 401, 'Geen toegang.')

  let body: { pushes?: unknown }
  try {
    body = (await request.json()) as { pushes?: unknown }
  } catch {
    return json(request, 400, 'Ongeldige aanvraag.')
  }
  if (!Array.isArray(body.pushes)) return json(request, 400, 'Ongeldige aanvraag.')
  const pushes = body.pushes.slice(0, MAX_PUSHES).filter(validPush)

  const options = {
    vapidDetails: { subject: env('VAPID_SUBJECT') ?? 'mailto:nexus@example.com', publicKey, privateKey },
    TTL: 6 * 60 * 60,
    urgency: 'high' as const,
  }
  const results = await Promise.all(
    pushes.map(async (p) => {
      try {
        const response = await webpush.sendNotification({ endpoint: p.endpoint, keys: { p256dh: p.p256dh, auth: p.auth } }, JSON.stringify(p.payload), options)
        return response.statusCode
      } catch (err) {
        // 404 or 410: the browser dropped the subscription; NEXUS on the phone subscribes again when opened.
        const status = (err as { statusCode?: number }).statusCode ?? 0
        console.warn(`push mislukt (${status})`)
        return status
      }
    }),
  )
  return new Response(JSON.stringify({ sent: results.filter((s) => s >= 200 && s < 300).length, results }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
