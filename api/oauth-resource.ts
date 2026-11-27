import { env } from './_shared.js'

/**
 * OAuth protected resource metadata (RFC 9728) for the NEXUS MCP-server: tells an MCP client that
 * /api/mcp accepts logins from NEXUS's Supabase Auth. Served at /.well-known/oauth-protected-resource
 * (rewrite in vercel.json).
 */
export function GET(request: Request): Response {
  const origin = new URL(request.url).origin
  const supabase = env('VITE_SUPABASE_URL')?.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '')
  if (!supabase) return new Response('Supabase is niet ingesteld op de server.', { status: 500 })
  return Response.json(
    {
      resource: `${origin}/api/mcp`,
      authorization_servers: [`${supabase}/auth/v1`],
      bearer_methods_supported: ['header'],
      resource_name: 'NEXUS OS',
      resource_documentation: `${origin}/`,
    },
    { headers: { 'cache-control': 'public, max-age=3600' } },
  )
}
