import { env } from './_shared.js'

/**
 * Agenda in Google: Google Agenda (or any calendar app) reads your NEXUS lessons here with the
 * secret code from the link, /api/agenda-feed?t=<code>. A NEXUS device writes the .ics text; the
 * database hands it out only for the right code (public.agenda_feed in
 * supabase/migrations/20261125090000_agenda_feed.sql). No login: Google cannot log in.
 */
export const TOKEN = /^[A-Za-z0-9_-]{32,64}$/

const text = (status: number, body: string) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('t') ?? ''
  if (!TOKEN.test(token)) return text(404, 'Deze agendalink bestaat niet.')
  const url = env('VITE_SUPABASE_URL')?.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '')
  const key = env('VITE_SUPABASE_ANON_KEY')
  if (!url || !key) return text(503, 'Supabase is niet ingesteld op de server.')
  let response: Response
  try {
    response = await fetch(`${url}/rest/v1/rpc/agenda_feed`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
    })
  } catch {
    return text(502, 'De database is niet bereikbaar.')
  }
  if (!response.ok) return text(response.status === 404 ? 501 : 502, response.status === 404 ? 'De database is nog niet bijgewerkt.' : 'De database gaf een fout.')
  const ics: unknown = await response.json().catch(() => null)
  if (typeof ics !== 'string' || !ics.startsWith('BEGIN:VCALENDAR')) return text(404, 'Deze agendalink bestaat niet (meer).')
  return new Response(ics, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="nexus.ics"',
      // Short, so a calendar that asks again sees changes, and nothing stays in a shared cache.
      'cache-control': 'private, max-age=300',
      'x-robots-tag': 'noindex',
    },
  })
}
