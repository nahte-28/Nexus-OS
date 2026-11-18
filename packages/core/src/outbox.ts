/**
 * Berichten die wachten op internet: privéberichten and teamchat written while offline stay on
 * this device and are sent, in order, as soon as there is a connection again.
 */

export type OutboxKind = 'dm' | 'team'

export interface OutboxItem {
  id: string
  kind: OutboxKind
  /** The account that wrote it; another account on this device never sends it. */
  owner: string
  /** The friend (dm) or team (team). */
  target: string
  text: string
  createdAt: number
  /** Set when the server refused it: it then waits for "Opnieuw" instead of retrying by itself. */
  error: string | null
}

/** More waiting messages than this and the oldest go: nobody writes fifty messages offline. */
export const OUTBOX_MAX = 50

export function parseOutbox(raw: unknown): OutboxItem[] {
  if (!Array.isArray(raw)) return []
  const out: OutboxItem[] = []
  for (const v of raw) {
    if (typeof v !== 'object' || v === null) continue
    const o = v as Record<string, unknown>
    if (typeof o.id !== 'string' || (o.kind !== 'dm' && o.kind !== 'team') || typeof o.owner !== 'string' || typeof o.target !== 'string' || typeof o.text !== 'string' || typeof o.createdAt !== 'number') continue
    out.push({ id: o.id, kind: o.kind, owner: o.owner, target: o.target, text: o.text, createdAt: o.createdAt, error: typeof o.error === 'string' ? o.error : null })
  }
  return out.sort((a, b) => a.createdAt - b.createdAt)
}

export function addToOutbox(list: OutboxItem[], item: OutboxItem): OutboxItem[] {
  return [...list.filter((i) => i.id !== item.id), item].sort((a, b) => a.createdAt - b.createdAt).slice(-OUTBOX_MAX)
}

/** The waiting messages of one conversation, oldest first. */
export function outboxFor(list: OutboxItem[], owner: string, kind: OutboxKind, target: string): OutboxItem[] {
  return list.filter((i) => i.owner === owner && i.kind === kind && i.target === target)
}

/** What the next flush tries: everything of this account without a refusal, oldest first. */
export function outboxDue(list: OutboxItem[], owner: string): OutboxItem[] {
  return list.filter((i) => i.owner === owner && i.error === null)
}

/**
 * True when sending failed because there is no connection (then the message waits), false when
 * the server answered with a refusal (then the person sees why).
 */
export function isNetworkFailure(err: unknown, online: boolean): boolean {
  if (!online) return true
  const text = err instanceof Error ? err.message : typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message) : String(err)
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|geen verbinding|timed? ?out|ERR_INTERNET|ERR_NETWORK/i.test(text)
}
