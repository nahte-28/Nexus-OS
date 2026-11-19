/**
 * Berichten die wachten op internet: privéberichten, teamchat and opmerkingen written while
 * offline stay on this device and are sent, in order, as soon as there is a connection again.
 */
import type { CommentTarget } from './taskComments'

export type OutboxKind = 'dm' | 'team' | 'comment'
const KINDS: readonly OutboxKind[] = ['dm', 'team', 'comment']

export interface OutboxItem {
  id: string
  kind: OutboxKind
  /** The account that wrote it; another account on this device never sends it. */
  owner: string
  /** The friend (dm), the team (team), or the task of an opmerking: see [commentOutboxTarget]. */
  target: string
  text: string
  createdAt: number
  /** Set when the server refused it: it then waits for "Opnieuw" instead of retrying by itself. */
  error: string | null
  /** Who an opmerking mentions (@name). */
  mentions?: string[]
}

/** More waiting messages than this and the oldest go: nobody writes fifty messages offline. */
export const OUTBOX_MAX = 50

export function parseOutbox(raw: unknown): OutboxItem[] {
  if (!Array.isArray(raw)) return []
  const out: OutboxItem[] = []
  for (const v of raw) {
    if (typeof v !== 'object' || v === null) continue
    const o = v as Record<string, unknown>
    if (typeof o.id !== 'string' || !KINDS.includes(o.kind as OutboxKind) || typeof o.owner !== 'string' || typeof o.target !== 'string' || typeof o.text !== 'string' || typeof o.createdAt !== 'number') continue
    const mentions = Array.isArray(o.mentions) ? o.mentions.filter((m): m is string => typeof m === 'string') : null
    out.push({ id: o.id, kind: o.kind as OutboxKind, owner: o.owner, target: o.target, text: o.text, createdAt: o.createdAt, error: typeof o.error === 'string' ? o.error : null, ...(mentions ? { mentions } : {}) })
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

/** An opmerking waits for one task: the team and the task in one outbox target. */
export function commentOutboxTarget(groupId: string, target: CommentTarget): string {
  return `${groupId}/${target.kind}/${target.taskId}`
}

export function parseCommentOutboxTarget(value: string): { groupId: string; target: CommentTarget } | null {
  const [groupId, kind, taskId, ...rest] = value.split('/')
  if (!groupId || !taskId || rest.length > 0 || (kind !== 'project' && kind !== 'group')) return null
  return { groupId, target: { kind, taskId } }
}
