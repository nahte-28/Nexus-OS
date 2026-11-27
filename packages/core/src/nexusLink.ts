import { APP_GROUP } from './appGroups'
import { sharedText } from './capture'
import { friendCodeFromPath } from './friends'
import { joinCodeFromPath } from './teams'
import type { AppId } from './windows'

/**
 * nexus:// links, opened by the Windows and Linux app from a browser, a shortcut or another
 * program. Anyone can make such a link, so it only does what a click in NEXUS also does without
 * asking: open an app or an item, fill in Snelle notitie (you still save it yourself), or fill in
 * an invitation or friend code (you still confirm it).
 *
 *   nexus://snel?text=…            Snelle notitie with that text (title/text/url as when sharing)
 *   nexus://snel?spraak=1          Spraaknotitie
 *   nexus://app/agenda             open an app
 *   nexus://app/notes/<id>         open an app at one item
 *   nexus://join/<code>            Teams with the invitation code
 *   nexus://vriend/<code>          Vrienden with the friend code
 */
export type NexusLink =
  | { kind: 'capture'; text: string; dictate: boolean }
  | { kind: 'app'; app: AppId; id?: string }
  | { kind: 'join'; code: string }
  | { kind: 'friend'; code: string }

export const NEXUS_SCHEME = 'nexus:'

/** Longer links are ignored: a link is a pointer, not a document. */
const MAX_LINK = 4096
const MAX_TEXT = 2000
const ID = /^[A-Za-z0-9_.:-]{1,80}$/

const isAppId = (value: string): value is AppId => Object.prototype.hasOwnProperty.call(APP_GROUP, value)

/** What a nexus:// link asks for; null for anything else or anything malformed. */
export function parseNexusLink(raw: string): NexusLink | null {
  if (typeof raw !== 'string' || raw.length > MAX_LINK) return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== NEXUS_SCHEME) return null
  // nexus://app/notes parses with host "app"; nexus:app/notes without one. Both mean the same.
  const path = `/${[url.host, ...url.pathname.split('/')].filter(Boolean).map(safeDecode).join('/')}`
  const parts = path.split('/').filter(Boolean)

  switch (parts[0]) {
    case 'snel':
      if (parts.length !== 1) return null
      return { kind: 'capture', text: sharedText(url.searchParams).slice(0, MAX_TEXT), dictate: url.searchParams.get('spraak') === '1' }
    case 'app': {
      const [, app, id] = parts
      if (parts.length > 3 || !app || !isAppId(app)) return null
      if (id === undefined) return { kind: 'app', app }
      return ID.test(id) ? { kind: 'app', app, id } : null
    }
    case 'join': {
      const code = joinCodeFromPath(path)
      return code ? { kind: 'join', code } : null
    }
    case 'vriend': {
      const code = friendCodeFromPath(path)
      return code ? { kind: 'friend', code } : null
    }
    default:
      return null
  }
}

function safeDecode(part: string): string {
  try {
    return decodeURIComponent(part)
  } catch {
    return '\u0000'
  }
}
