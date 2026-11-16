/**
 * Notities delen: you share a note with friends or teams, to read or to edit along. The server keeps
 * the shared copy with a revision; your own note and that copy keep each other up to date. Pure
 * logic: which side changed and what to send or take over.
 */
import type { Note } from './notes'

export type ShareRight = 'owner' | 'edit' | 'read'

export interface ShareAccess {
  user: string | null
  group: string | null
  name: string
  canEdit: boolean
}

export interface NoteShare {
  id: string
  right: ShareRight
  /** Your note in Notities; only for shares you own. */
  noteId: string | null
  ownerName: string
  title: string
  body: string
  revision: number
  updatedAt: number
  updatedByMe: boolean
  updatedByName: string
  /** Who it is shared with; only for shares you own. */
  access: ShareAccess[]
}

export const SHARE_BODY_MAX = 100_000
export const SHARE_TITLE_MAX = 200
export const SHARE_MAX_ACCESS = 50

const time = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? v : NaN)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

function parseAccess(raw: unknown): ShareAccess[] {
  return (Array.isArray(raw) ? raw : []).flatMap((v): ShareAccess[] => {
    const a = (v ?? {}) as Record<string, unknown>
    const user = typeof a.user === 'string' ? a.user : null
    const group = typeof a.group === 'string' ? a.group : null
    if ((user === null) === (group === null)) return []
    return [{ user, group, name: str(a.name).slice(0, 60) || 'Zonder naam', canEdit: a.canEdit === true }]
  })
}

export function parseShare(raw: unknown): NoteShare | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || (r.right !== 'owner' && r.right !== 'edit' && r.right !== 'read')) return null
  if (typeof r.revision !== 'number' || !Number.isInteger(r.revision)) return null
  if (r.right === 'owner' && typeof r.noteId !== 'string') return null
  const updatedAt = time(r.updatedAt)
  return {
    id: r.id,
    right: r.right,
    noteId: r.right === 'owner' ? (r.noteId as string) : null,
    ownerName: str(r.ownerName).slice(0, 40) || 'Iemand',
    title: str(r.title).slice(0, SHARE_TITLE_MAX),
    body: str(r.body).slice(0, SHARE_BODY_MAX),
    revision: r.revision,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    updatedByMe: r.updatedByMe === true,
    updatedByName: str(r.updatedByName).slice(0, 40),
    access: r.right === 'owner' ? parseAccess(r.access) : [],
  }
}

export function parseShares(raw: unknown): NoteShare[] {
  return (Array.isArray(raw) ? raw : []).map(parseShare).filter((s): s is NoteShare => s !== null)
}

/** What this device saw of a share you own the last time both sides were the same. */
export interface ShareSeen {
  revision: number
  /** When your note and the share were last the same, on this device's clock. */
  syncedAt: number
}

export interface OwnerPlan {
  /** Someone else saved: take their text into your note. */
  pull: Array<{ share: string; note: string; title: string; body: string }>
  /** You changed your note: send it, on top of the revision you saw. */
  push: Array<{ share: string; revision: number; title: string; body: string }>
  /** You deleted the note: stop sharing it. */
  stop: string[]
  /** Shares where both sides are the same now. */
  seen: Record<string, ShareSeen>
}

/**
 * Keeps your shared notes and the copies in line. A side that changed since the last time they
 * matched wins; when both changed, the newest edit wins.
 */
export function planOwnerSync(shares: NoteShare[], notes: Note[], seen: Record<string, ShareSeen>, now: number): OwnerPlan {
  const byId = new Map(notes.map((n) => [n.id, n]))
  const plan: OwnerPlan = { pull: [], push: [], stop: [], seen: {} }
  for (const s of shares) {
    if (s.right !== 'owner' || !s.noteId) continue
    const note = byId.get(s.noteId)
    // Not on this device yet (still syncing): leave it until it is.
    if (!note) {
      if (seen[s.id]) plan.seen[s.id] = seen[s.id]
      continue
    }
    if (note.deletedAt !== null) {
      plan.stop.push(s.id)
      continue
    }
    const title = note.title.slice(0, SHARE_TITLE_MAX)
    const body = note.body.slice(0, SHARE_BODY_MAX)
    if (title === s.title && body === s.body) {
      plan.seen[s.id] = { revision: s.revision, syncedAt: now }
      continue
    }
    const last = seen[s.id]
    const theirs = !last || s.revision > last.revision
    const mine = !last || note.updatedAt > last.syncedAt
    const pushIt = mine && !theirs ? true : theirs && !mine ? false : note.updatedAt > s.updatedAt
    if (pushIt) plan.push.push({ share: s.id, revision: s.revision, title, body })
    else plan.pull.push({ share: s.id, note: note.id, title: s.title, body: s.body })
    if (last) plan.seen[s.id] = last
  }
  return plan
}

/** Notes shared with you, newest first. */
export const sharedWithMe = (shares: NoteShare[]) => shares.filter((s) => s.right !== 'owner').sort((a, b) => b.updatedAt - a.updatedAt)

/** Your share of [noteId], if you shared it. */
export const shareOfNote = (shares: NoteShare[], noteId: string) => shares.find((s) => s.right === 'owner' && s.noteId === noteId) ?? null

/** One line under a shared note: whose it is and who saved last. */
export function shareLine(s: NoteShare): string {
  const by = s.updatedByMe ? 'jou' : s.updatedByName || s.ownerName
  const from = s.right === 'owner' ? 'Je deelt deze notitie' : `Van ${s.ownerName}${s.right === 'read' ? ', alleen lezen' : ''}`
  return `${from} · laatst bewaard door ${by}`
}
