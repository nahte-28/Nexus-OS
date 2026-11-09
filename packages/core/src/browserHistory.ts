/**
 * The NEXUS Browser's history: pages visited in the Windows app's browser window, newest first.
 * It stays on the device (never synced), and a reload or a title that arrives later does not add
 * a second line for the same page.
 */
export interface Visit {
  url: string
  title: string
  /** Last visit, epoch ms. */
  at: number
}

export const MAX_VISITS = 300
/** A visit to the page on top within this time updates that line instead of adding one. */
const SAME_VISIT_MS = 30 * 60_000

export function addPageVisit(history: Visit[], visit: Visit): Visit[] {
  if (!/^https?:\/\//i.test(visit.url)) return history
  const top = history[0]
  if (top && top.url === visit.url && visit.at - top.at < SAME_VISIT_MS) {
    return [{ url: top.url, title: visit.title || top.title, at: visit.at }, ...history.slice(1)]
  }
  return [visit, ...history].slice(0, MAX_VISITS)
}

/** Sets the title of the newest visit of [url], which often arrives after the page loaded. */
export function titleVisit(history: Visit[], url: string, title: string): Visit[] {
  const at = history.findIndex((v) => v.url === url)
  if (at < 0 || !title || history[at].title === title) return history
  return history.map((v, i) => (i === at ? { ...v, title } : v))
}

export function searchHistory(history: Visit[], query: string): Visit[] {
  const q = query.trim().toLowerCase()
  return q ? history.filter((v) => v.title.toLowerCase().includes(q) || v.url.toLowerCase().includes(q)) : history
}

export function forgetVisit(history: Visit[], visit: Visit): Visit[] {
  return history.filter((v) => !(v.url === visit.url && v.at === visit.at))
}

export function parseHistory(raw: unknown): Visit[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((v): v is Visit => !!v && typeof v === 'object' && typeof v.url === 'string' && typeof v.title === 'string' && typeof v.at === 'number' && /^https?:\/\//i.test(v.url))
    .slice(0, MAX_VISITS)
}
