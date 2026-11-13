/**
 * Beheer: the overview for the owner of this NEXUS. The database adds it up (admin_overview) and
 * gives only counts and names, never the text of notes, messages or files. Pure logic: reading
 * the answer safely and the short summaries.
 */

export interface AdminOverview {
  at: number
  accounts: { total: number; new7d: number; signedIn7d: number; active24h: number; active7d: number }
  online: Array<{ name: string; state: 'available' | 'busy'; lastSeen: number | null }>
  devices: Record<string, number>
  teams: Array<{ name: string; members: number; online: number; messages7d: number; createdAt: number }>
  activity: { friendships: number; requests: number; teamMessages7d: number; comments7d: number; directMessages7d: number }
  errors: { count7d: number; latest: Array<{ at: number; app: string; message: string; note: string | null; version: string; name: string }> }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : 0)
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback)
const time = (v: unknown) => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN
  return Number.isFinite(t) ? t : null
}
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** The answer of admin_overview as typed data; missing parts become 0 or empty. */
export function parseAdminOverview(raw: unknown): AdminOverview {
  const o = obj(raw)
  const a = obj(o.accounts)
  const act = obj(o.activity)
  const e = obj(o.errors)
  const devices: Record<string, number> = {}
  for (const [k, v] of Object.entries(obj(o.devices))) devices[k] = num(v)
  return {
    at: time(o.at) ?? 0,
    accounts: { total: num(a.total), new7d: num(a.new7d), signedIn7d: num(a.signedIn7d), active24h: num(a.active24h), active7d: num(a.active7d) },
    online: list(o.online).map((x) => {
      const p = obj(x)
      return { name: str(p.name, 'Zonder naam'), state: p.state === 'busy' ? 'busy' : 'available', lastSeen: time(p.lastSeen) }
    }),
    devices,
    teams: list(o.teams).map((x) => {
      const t = obj(x)
      return { name: str(t.name, 'Team'), members: num(t.members), online: num(t.online), messages7d: num(t.messages7d), createdAt: time(t.createdAt) ?? 0 }
    }),
    activity: { friendships: num(act.friendships), requests: num(act.requests), teamMessages7d: num(act.teamMessages7d), comments7d: num(act.comments7d), directMessages7d: num(act.directMessages7d) },
    errors: {
      count7d: num(e.count7d),
      latest: list(e.latest).map((x) => {
        const r = obj(x)
        return { at: time(r.at) ?? 0, app: str(r.app), message: str(r.message), note: typeof r.note === 'string' && r.note ? r.note : null, version: str(r.version), name: str(r.name, 'Zonder naam') }
      }),
    },
  }
}

const PLATFORM: Record<string, string> = { web: 'browser', desktop: 'Windows- of Linux-app', android: 'gsm-app' }

/** "3 browser, 1 gsm-app": active devices of the last 30 days, most first. */
export function deviceSummary(devices: Record<string, number>): string {
  const parts = Object.entries(devices)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, n]) => `${n} ${PLATFORM[k] ?? k}`)
  return parts.length ? parts.join(', ') : 'geen'
}

/** Teams with people online first, then the busiest of the last week, then by name. */
export function sortAdminTeams(teams: AdminOverview['teams']): AdminOverview['teams'] {
  return [...teams].sort((a, b) => b.online - a.online || b.messages7d - a.messages7d || a.name.localeCompare(b.name, 'nl'))
}
