import { handleMcp, parseProfilesState, toLifeItem, toNote, type LifeItem, type McpData, type Note } from './_core.js'
import { env } from './_shared.js'

/**
 * NEXUS MCP-server (R14): https://<NEXUS>/api/mcp, for Claude and other assistants. You sign in
 * with your NEXUS account through Supabase (OAuth 2.1; the consent screen is /oauth/consent in the
 * web app), and every read and write goes to Supabase with that login, so row-level security
 * limits it to your own data. No service key is used here. Tools and checks: packages/core/src/mcp.ts.
 */

const MAX_BODY = 256 * 1024
/** Browsers may only call from these pages; MCP clients themselves send no Origin. */
const ALLOWED_ORIGINS = new Set(['https://claude.ai', 'https://claude.com'])

function supabase(): { url: string; key: string } {
  const url = env('VITE_SUPABASE_URL')?.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '')
  const key = env('VITE_SUPABASE_ANON_KEY')
  if (!url || !key) throw new Error('Supabase is niet ingesteld op de server.')
  return { url, key }
}

const metadataUrl = (request: Request) => `${new URL(request.url).origin}/.well-known/oauth-protected-resource`

function unauthorized(request: Request, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl(request)}"`,
    },
  })
}

/** The user the OAuth access token belongs to; null when it is not (or no longer) valid. */
async function userFor(token: string): Promise<string | null> {
  const { url, key } = supabase()
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } })
  if (!response.ok) return null
  const user = (await response.json()) as { id?: unknown }
  return typeof user.id === 'string' ? user.id : null
}

/** PostgREST with the user's own token: RLS applies as in the app. */
function rest(token: string) {
  const { url, key } = supabase()
  const headers = { apikey: key, Authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  return {
    async get<T>(path: string): Promise<T[]> {
      const response = await fetch(`${url}/rest/v1/${path}`, { headers })
      if (!response.ok) throw new Error(`Supabase antwoordde ${response.status} op ${path.split('?')[0]}.`)
      return (await response.json()) as T[]
    },
    async insert(table: string, row: Record<string, unknown>): Promise<void> {
      const response = await fetch(`${url}/rest/v1/${table}`, { method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(row) })
      if (!response.ok) throw new Error(`Opslaan in ${table} mislukte (${response.status}).`)
    },
  }
}

interface LifeRow {
  id: string
  kind: string
  data: Record<string, unknown>
  updated_at: number
  deleted_at: number | null
}

interface NoteRow {
  id: string
  title: string
  body: string
  updated_at: number
  deleted_at: number | null
}

function dataFor(token: string, timeZone: string, profiles: ReturnType<typeof parseProfilesState>): McpData {
  const db = rest(token)
  return {
    now: Date.now(),
    timeZone,
    newId: () => crypto.randomUUID(),
    async lifeItems() {
      const rows = await db.get<LifeRow>('life_items?select=id,kind,data,updated_at,deleted_at&deleted_at=is.null&limit=5000')
      return rows.map((r) => toLifeItem({ ...r.data, id: r.id, kind: r.kind, updatedAt: Number(r.updated_at), deletedAt: null })).filter((i): i is LifeItem => i !== null)
    },
    async timetable() {
      // The extra calendars of Profielen (family, work, ...) show like Google Agenda, as in the Agenda app.
      const extra = profiles.extraCalendars.flatMap((c) => profiles.extraEvents[c.id]?.events ?? [])
      return { calendarEvents: profiles.calendarEvents, lessons: profiles.lessons, googleEvents: [...profiles.googleEvents, ...extra] }
    },
    async notes() {
      const rows = await db.get<NoteRow>('notes?select=id,title,body,updated_at,deleted_at&deleted_at=is.null&order=updated_at.desc&limit=1000')
      return rows.map((r) => toNote({ id: r.id, title: r.title, body: r.body, updatedAt: Number(r.updated_at), deletedAt: null })).filter((n): n is Note => n !== null)
    },
    async saveNote(note) {
      await db.insert('notes', { id: note.id, title: note.title, body: note.body, updated_at: note.updatedAt, deleted_at: null })
    },
    async saveLifeItem(item) {
      // Like toRow in apps/web/src/life/sync.ts: everything but the sync fields goes in data.
      const { id, kind, updatedAt, deletedAt, ...data } = item
      await db.insert('life_items', { id, kind, data, updated_at: updatedAt, deleted_at: deletedAt })
    },
  }
}

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin && !ALLOWED_ORIGINS.has(origin)) return new Response('Origin niet toegestaan', { status: 403 })

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
  if (!token) return unauthorized(request, 'Log in met je NEXUS-account.')
  let userId: string | null
  try {
    userId = await userFor(token)
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
  if (!userId) return unauthorized(request, 'Je login is verlopen of ingetrokken. Log opnieuw in.')

  const raw = await request.text()
  if (raw.length > MAX_BODY) return new Response('Verzoek te groot', { status: 413 })
  let message: unknown
  try {
    message = JSON.parse(raw)
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Geen geldige JSON.' } }, { status: 400 })
  }

  try {
    const rows = await rest(token).get<{ value: unknown }>('user_settings?select=value&key=eq.profiles')
    const profiles = parseProfilesState(rows[0]?.value ?? null)
    const timeZone = profiles.schedule.timeZone || 'Europe/Brussels'
    // The agenda counts days on the wall clock of this zone (agendaDay uses local time).
    process.env.TZ = timeZone
    const answer = await handleMcp(message, dataFor(token, timeZone, profiles))
    if (!answer) return new Response(null, { status: 202 })
    return Response.json(answer)
  } catch (err) {
    const id = typeof message === 'object' && message !== null && 'id' in message ? (message as { id: unknown }).id : null
    return Response.json({ jsonrpc: '2.0', id: typeof id === 'string' || typeof id === 'number' ? id : null, error: { code: -32603, message: err instanceof Error ? err.message : 'Er ging iets mis.' } })
  }
}

/**
 * OAuth protected resource metadata (RFC 9728), served at /.well-known/oauth-protected-resource
 * through a rewrite in vercel.json: tells an MCP client to log in with NEXUS's Supabase Auth. It
 * lives in this function because the Hobby plan allows 12 functions per deployment.
 */
function resourceMetadata(request: Request): Response {
  const origin = new URL(request.url).origin
  return Response.json(
    {
      resource: `${origin}/api/mcp`,
      authorization_servers: [`${supabase().url}/auth/v1`],
      bearer_methods_supported: ['header'],
      resource_name: 'NEXUS OS',
      resource_documentation: `${origin}/`,
    },
    { headers: { 'cache-control': 'public, max-age=3600' } },
  )
}

/** GET is only the metadata above; there is no server-to-client stream, answers come on the POST. */
export function GET(request: Request): Response {
  if (new URL(request.url).searchParams.has('resource-metadata')) return resourceMetadata(request)
  return new Response('Gebruik POST', { status: 405, headers: { Allow: 'POST' } })
}

export function DELETE(): Response {
  return new Response('Gebruik POST', { status: 405, headers: { Allow: 'POST' } })
}
