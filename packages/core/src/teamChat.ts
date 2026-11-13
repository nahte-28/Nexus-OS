/**
 * Teamchat: messages in a team (a study group with roles). Pure logic: grouping messages into
 * runs of one sender, day separators, unread counts and the text of a notice.
 */

export const TEAM_MESSAGE_MAX = 2000
/** How many messages a team keeps; older ones are removed by the database. */
export const TEAM_CHAT_KEEP = 500
/** How many the chat loads at once. */
export const TEAM_CHAT_PAGE = 100
/** Messages of one sender within this time are shown as one run. */
const RUN_GAP_MS = 5 * 60_000

export interface TeamMessage {
  id: string
  groupId: string
  userId: string
  body: string
  createdAt: number
}

/** Trims a message; null when nothing is left to send. */
export function cleanMessage(text: string): string | null {
  const body = text.replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim()
  if (!body) return null
  return body.length > TEAM_MESSAGE_MAX ? body.slice(0, TEAM_MESSAGE_MAX) : body
}

/** Messages in time order, without doubles (realtime and a reload can bring the same one). */
export function mergeMessages(a: TeamMessage[], b: TeamMessage[]): TeamMessage[] {
  const byId = new Map<string, TeamMessage>()
  for (const m of [...a, ...b]) byId.set(m.id, m)
  return [...byId.values()].sort((x, y) => x.createdAt - y.createdAt || x.id.localeCompare(y.id))
}

export interface ChatRun {
  userId: string
  /** The day this run starts on, when it is the first of that day: shown as a separator. */
  day: string | null
  messages: TeamMessage[]
}

const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** "Vandaag", "Gisteren" or a date, for the separator above the first message of a day. */
export function chatDayLabel(t: number, now: number): string {
  if (dayKey(t) === dayKey(now)) return 'Vandaag'
  if (dayKey(t) === dayKey(now - 86_400_000)) return 'Gisteren'
  return new Date(t).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', ...(new Date(t).getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) })
}

/** Consecutive messages of one sender, close in time and on one day, as one run. */
export function chatRuns(messages: TeamMessage[], now: number): ChatRun[] {
  const runs: ChatRun[] = []
  let lastDay: string | null = null
  for (const m of messages) {
    const day = dayKey(m.createdAt)
    const last = runs[runs.length - 1]
    const prev = last?.messages[last.messages.length - 1]
    if (last && prev && last.userId === m.userId && day === lastDay && m.createdAt - prev.createdAt <= RUN_GAP_MS) {
      last.messages.push(m)
      continue
    }
    runs.push({ userId: m.userId, day: day === lastDay ? null : chatDayLabel(m.createdAt, now), messages: [m] })
    lastDay = day
  }
  return runs
}

/** Messages of others after the moment you last read this chat. */
export function unreadMessages(messages: TeamMessage[], readAt: number, me: string): number {
  return messages.filter((m) => m.userId !== me && m.createdAt > readAt).length
}

/** The notice for a new message: who and where in the title, the start of the text below. */
export function chatNotice(senderName: string, teamName: string, body: string): { title: string; body: string } {
  const text = body.replace(/\s+/g, ' ').trim()
  return { title: `${senderName} in ${teamName}`, body: text.length > 140 ? `${text.slice(0, 139)}…` : text }
}
