/**
 * Opmerkingen with @vermeldingen on team project tasks and group deadlines. Pure logic: finding
 * the members someone mentions, the suggestions while typing after @, and the text of a notice.
 */

export const TASK_COMMENT_MAX = 1000
export const MENTIONS_MAX = 10

export type CommentTarget = { kind: 'project'; taskId: string } | { kind: 'group'; taskId: string }

export interface TaskComment {
  id: string
  groupId: string
  target: CommentTarget
  userId: string
  body: string
  mentions: string[]
  createdAt: number
}

interface Named {
  userId: string
  displayName: string
}

const boundary = (c: string | undefined) => c === undefined || !/[\p{L}\p{N}_]/u.test(c)

/**
 * Members mentioned as @Naam in [text] (names may hold spaces; the longest name that fits wins,
 * case does not matter). Never [me], each only once, at most MENTIONS_MAX.
 */
export function findMentions(text: string, members: Named[], me?: string): string[] {
  const sorted = [...members].filter((m) => m.displayName.trim()).sort((a, b) => b.displayName.length - a.displayName.length)
  const lower = text.toLocaleLowerCase('nl')
  const found: string[] = []
  for (let i = lower.indexOf('@'); i !== -1; i = lower.indexOf('@', i + 1)) {
    if (!boundary(lower[i - 1])) continue
    const hit = sorted.find((m) => {
      const name = m.displayName.toLocaleLowerCase('nl')
      return lower.startsWith(name, i + 1) && boundary(lower[i + 1 + name.length])
    })
    if (hit && hit.userId !== me && !found.includes(hit.userId)) found.push(hit.userId)
  }
  return found.slice(0, MENTIONS_MAX)
}

/** While typing: the text after an @ right before the caret, or null when not mentioning. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at === -1 || !boundary(before[at - 1])) return null
  const query = before.slice(at + 1)
  if (query.length > 40 || /[\n@]/.test(query) || /\s{2}/.test(query)) return null
  return { start: at, query }
}

/** Members whose name starts with (or has a word starting with) [query]; at most 6. */
export function mentionSuggestions<T extends Named>(members: T[], query: string, me?: string): T[] {
  const q = query.trim().toLocaleLowerCase('nl')
  return members
    .filter((m) => m.userId !== me)
    .filter((m) => {
      const name = m.displayName.toLocaleLowerCase('nl')
      return !q || name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q))
    })
    .slice(0, 6)
}

/** Puts @Naam in place of what was typed after the @; returns the new text and caret. */
export function completeMention(text: string, at: { start: number; query: string }, name: string): { text: string; caret: number } {
  const insert = `@${name} `
  const end = at.start + 1 + at.query.length
  return { text: text.slice(0, at.start) + insert + text.slice(end), caret: at.start + insert.length }
}

/** Splits a comment into plain text and @mentions of known members, for showing them in bold. */
export function mentionParts(text: string, members: Named[]): Array<{ text: string; userId?: string }> {
  const sorted = [...members].filter((m) => m.displayName.trim()).sort((a, b) => b.displayName.length - a.displayName.length)
  const lower = text.toLocaleLowerCase('nl')
  const parts: Array<{ text: string; userId?: string }> = []
  let from = 0
  for (let i = lower.indexOf('@'); i !== -1; i = lower.indexOf('@', i + 1)) {
    if (i < from || !boundary(lower[i - 1])) continue
    const hit = sorted.find((m) => {
      const name = m.displayName.toLocaleLowerCase('nl')
      return lower.startsWith(name, i + 1) && boundary(lower[i + 1 + name.length])
    })
    if (!hit) continue
    if (i > from) parts.push({ text: text.slice(from, i) })
    const end = i + 1 + hit.displayName.length
    parts.push({ text: text.slice(i, end), userId: hit.userId })
    from = end
  }
  if (from < text.length) parts.push({ text: text.slice(from) })
  return parts
}

/** Comments per task, for the counter on each task. */
export function commentCounts(comments: Array<Pick<TaskComment, 'target'>>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const c of comments) counts.set(c.target.taskId, (counts.get(c.target.taskId) ?? 0) + 1)
  return counts
}

/** The notice when someone mentions you. */
export function mentionNotice(senderName: string, taskTitle: string, body: string): { title: string; body: string } {
  const text = body.replace(/\s+/g, ' ').trim()
  return { title: `${senderName} noemde je bij ${taskTitle}`, body: text.length > 140 ? `${text.slice(0, 139)}…` : text }
}
