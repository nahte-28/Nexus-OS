import { parseDeadline } from '../packages/core/src/life.js'
export async function GET(): Promise<Response> {
  return new Response(JSON.stringify(parseDeadline({ title: 'x', dueAt: '2026-12-01T10:00:00+01:00' })), { headers: { 'content-type': 'application/json' } })
}
