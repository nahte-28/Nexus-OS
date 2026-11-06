/**
 * Browser: your bookmarks and a start page with a search bar. The bookmarks live in the profiles
 * document (ProfilesState.bookmarks), so they sync with your account and need no SQL step. On the
 * web and on the phone a site opens in your own browser; in the Windows app in a NEXUS browser window.
 * Pure logic.
 */

export const MAX_BOOKMARKS = 200
const MAX_TITLE = 80
const MAX_FOLDER = 40
const MAX_URL = 2000

export interface Bookmark {
  id: string
  title: string
  url: string
  /** A folder name to group by; empty for none. */
  folder: string
  addedAt: number
}

export type SearchEngine = 'google' | 'duckduckgo' | 'bing' | 'ecosia'
export const SEARCH_ENGINES: Record<SearchEngine, { name: string; url: string }> = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  ecosia: { name: 'Ecosia', url: 'https://www.ecosia.org/search?q=' },
}

export interface BrowserSettings {
  engine: SearchEngine
  bookmarks: Bookmark[]
}

export const emptyBrowser = (): BrowserSettings => ({ engine: 'google', bookmarks: [] })

/** A safe http(s) address for [input], with https:// added when it is missing; null when it is none. */
export function webAddress(input: string): string | null {
  const raw = input.trim()
  if (!raw || /\s/.test(raw) || raw.length > MAX_URL) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password) return null
  const host = url.hostname
  // A host needs a dot (example.com) or is localhost; "hallo" alone is a search.
  if (host !== 'localhost' && !/\.[a-z0-9-]{2,}$/i.test(host) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null
  return url.href
}

/** Where the search bar goes: the address you typed, or a search with your engine. */
export function resolveInput(input: string, engine: SearchEngine): string | null {
  const text = input.trim()
  if (!text) return null
  return webAddress(text) ?? `${SEARCH_ENGINES[engine].url}${encodeURIComponent(text)}`
}

/** "www.vrt.be" for https://www.vrt.be/nws, for a title when you give none. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function parseBrowser(raw: unknown): BrowserSettings {
  if (typeof raw !== 'object' || raw === null) return emptyBrowser()
  const r = raw as Record<string, unknown>
  const seen = new Set<string>()
  const bookmarks: Bookmark[] = []
  for (const x of Array.isArray(r.bookmarks) ? r.bookmarks : []) {
    const b = x as Record<string, unknown> | null
    const url = typeof b?.url === 'string' ? webAddress(b.url) : null
    if (!b || typeof b.id !== 'string' || !url || seen.has(b.id)) continue
    seen.add(b.id)
    bookmarks.push({ id: b.id, title: str(b.title, MAX_TITLE) || hostOf(url), url, folder: str(b.folder, MAX_FOLDER), addedAt: typeof b.addedAt === 'number' ? b.addedAt : 0 })
    if (bookmarks.length >= MAX_BOOKMARKS) break
  }
  return { engine: typeof r.engine === 'string' && Object.prototype.hasOwnProperty.call(SEARCH_ENGINES, r.engine) ? (r.engine as SearchEngine) : 'google', bookmarks }
}

/** Adds or changes a bookmark; the same address twice is refused. */
export function saveBookmark(s: BrowserSettings, input: { id: string; title: string; url: string; folder?: string }, now: number): BrowserSettings | { error: string } {
  const url = webAddress(input.url)
  if (!url) return { error: 'Dat is geen geldig webadres (bv. vrt.be of https://…).' }
  if (s.bookmarks.some((b) => b.id !== input.id && b.url === url)) return { error: 'Die bladwijzer heb je al.' }
  const existing = s.bookmarks.find((b) => b.id === input.id)
  if (!existing && s.bookmarks.length >= MAX_BOOKMARKS) return { error: `Hoogstens ${MAX_BOOKMARKS} bladwijzers.` }
  const bookmark: Bookmark = { id: input.id, title: input.title.trim().slice(0, MAX_TITLE) || hostOf(url), url, folder: (input.folder ?? '').trim().slice(0, MAX_FOLDER), addedAt: existing?.addedAt ?? now }
  return { ...s, bookmarks: existing ? s.bookmarks.map((b) => (b.id === input.id ? bookmark : b)) : [...s.bookmarks, bookmark] }
}

export const deleteBookmark = (s: BrowserSettings, id: string): BrowserSettings => ({ ...s, bookmarks: s.bookmarks.filter((b) => b.id !== id) })

/** Moves a bookmark one place up (-1) or down (+1) within the whole list. */
export function moveBookmark(s: BrowserSettings, id: string, by: -1 | 1): BrowserSettings {
  const i = s.bookmarks.findIndex((b) => b.id === id)
  const j = i + by
  if (i < 0 || j < 0 || j >= s.bookmarks.length) return s
  const list = [...s.bookmarks]
  ;[list[i], list[j]] = [list[j], list[i]]
  return { ...s, bookmarks: list }
}

/** Bookmarks grouped by folder, in their own order; the group without a folder comes first. */
export function bookmarkGroups(bookmarks: Bookmark[], query = ''): Array<{ folder: string; items: Bookmark[] }> {
  const q = query.trim().toLowerCase()
  const hits = q ? bookmarks.filter((b) => `${b.title} ${b.url} ${b.folder}`.toLowerCase().includes(q)) : bookmarks
  const groups = new Map<string, Bookmark[]>()
  for (const b of hits) groups.set(b.folder, [...(groups.get(b.folder) ?? []), b])
  return [...groups.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'nl'))).map(([folder, items]) => ({ folder, items }))
}

/** Bookmarks from both copies of the first sync, without doubles (by id or address). */
export function mergeBookmarks(base: Bookmark[], other: Bookmark[]): Bookmark[] {
  const extra = other.filter((o) => !base.some((b) => b.id === o.id || b.url === o.url))
  return extra.length === 0 ? base : [...base, ...extra].slice(0, MAX_BOOKMARKS)
}
