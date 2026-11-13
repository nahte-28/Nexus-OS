import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { chatRuns, mergeMessages, memberName, TEAM_CHAT_PAGE, TEAM_MESSAGE_MAX, teamCan, unreadMessages, type StudyGroup, type TeamMember, type TeamMessage, type TeamRole } from '@nexus/core'
import { chatReadAt, markChatRead, setOpenChat, type TeamChat } from './chat'

const REFRESH_MS = 60_000
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const time = (t: number) => new Date(t).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })

export interface TeamChatState {
  messages: TeamMessage[]
  problem: string | null
  /** Messages of others you have not seen in the chat yet. */
  unread: number
  more: boolean
  loadOlder: () => Promise<void>
  send: (text: string) => Promise<boolean>
  remove: (id: string) => Promise<void>
  markRead: () => void
}

/** The chat of one team, live while Teams is open (also for the unread count on the tab). */
export function useTeamChat(chat: TeamChat | null, team: StudyGroup | null, me: string | undefined): TeamChatState {
  const [messages, setMessages] = useState<TeamMessage[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [readAt, setReadAt] = useState(0)
  const groupId = team?.id ?? null

  const refresh = useCallback(async () => {
    if (!chat || !groupId) return
    try {
      const page = await chat.load(groupId)
      // The newest page replaces what it covers, so removed messages go; older pages stay.
      setMessages((old) => (page.length === 0 ? [] : [...old.filter((m) => m.groupId === groupId && m.createdAt < page[0].createdAt), ...page]))
      setMore((m) => m || page.length === TEAM_CHAT_PAGE)
      setProblem(null)
    } catch (err) {
      setProblem(message(err))
    }
  }, [chat, groupId])

  useEffect(() => {
    setMessages([])
    setMore(false)
    setReadAt(groupId ? chatReadAt(groupId) : 0)
    if (!chat || !groupId) return
    void refresh()
    const t = setInterval(() => void refresh(), REFRESH_MS)
    const stop = chat.watch(groupId, (m) => setMessages((old) => mergeMessages(old, [m])))
    return () => {
      clearInterval(t)
      stop()
    }
  }, [chat, groupId, refresh])

  return {
    messages,
    problem,
    more,
    unread: me ? unreadMessages(messages, readAt, me) : 0,
    loadOlder: async () => {
      if (!chat || !groupId || messages.length === 0) return
      try {
        const page = await chat.load(groupId, messages[0].createdAt)
        setMessages((old) => mergeMessages(page, old))
        setMore(page.length === TEAM_CHAT_PAGE)
      } catch (err) {
        setProblem(message(err))
      }
    },
    send: async (text) => {
      if (!chat || !groupId) return false
      try {
        const sent = await chat.send(groupId, text)
        if (sent) setMessages((old) => mergeMessages(old, [sent]))
        setProblem(null)
        return sent !== null
      } catch (err) {
        setProblem(message(err))
        return false
      }
    },
    remove: async (id) => {
      if (!chat) return
      try {
        await chat.remove(id)
        setMessages((old) => old.filter((m) => m.id !== id))
      } catch (err) {
        setProblem(message(err))
      }
    },
    markRead: () => {
      if (!groupId) return
      const last = messages[messages.length - 1]?.createdAt ?? 0
      if (last > readAt) {
        markChatRead(groupId, last)
        setReadAt(last)
      }
    },
  }
}

/** Teams › Chat: the messages of the team, newest at the bottom, and a field to write. */
export function TeamChatPanel({ team, members, me, role, state }: { team: StudyGroup; members: TeamMember[]; me: string; role: TeamRole | null; state: TeamChatState }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const { messages, markRead } = state
  const last = messages[messages.length - 1]?.id

  // No notices for this team while you look at its chat.
  useEffect(() => {
    setOpenChat(team.id)
    return () => setOpenChat(null)
  }, [team.id])
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' })
    markRead()
    // Only when a new message comes in at the bottom.
  }, [last])

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    if (await state.send(text)) setText('')
    setSending(false)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter starts a new line.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) void submit(e)
  }

  const now = Date.now()
  return (
    <div className="flex min-h-[18rem] flex-col gap-3">
      {state.problem?.startsWith('setup:') ? (
        <p role="alert" className="rounded-md border border-amber-500/40 p-2 text-amber-700 dark:text-amber-300">
          De teamchat heeft nog een stap in de database nodig: voer eenmalig <code>{state.problem.slice(6)}</code> uit in de SQL Editor van Supabase (of via Account › Database-check).
        </p>
      ) : (
        state.problem && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">{state.problem}</p>
      )}
      {state.more && (
        <button type="button" className="self-center rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2" onClick={() => void state.loadOlder()}>
          Oudere berichten laden
        </button>
      )}
      {messages.length === 0 && !state.problem && <p className="text-nx-muted">Nog geen berichten in {team.name}. Schrijf het eerste: iedereen in het team leest mee.</p>}
      <ol aria-label={`Chat van ${team.name}`} className="space-y-2">
        {chatRuns(messages, now).map((run) => {
          const mine = run.userId === me
          return (
            <li key={run.messages[0].id} className="space-y-1">
              {run.day && <p className="py-1 text-center text-xs text-nx-muted">{run.day}</p>}
              <div className={`flex flex-col gap-0.5 ${mine ? 'items-end' : 'items-start'}`}>
                <span className="px-1 text-xs text-nx-muted">
                  {mine ? 'Jij' : memberName(members, run.userId, me)} · {time(run.messages[0].createdAt)}
                </span>
                {run.messages.map((m) => (
                  <div key={m.id} className="group flex max-w-[85%] items-center gap-1">
                    {(mine || teamCan(role, 'manage')) && (
                      <button
                        type="button"
                        aria-label={`Bericht van ${time(m.createdAt)} verwijderen`}
                        title="Verwijderen"
                        className={`rounded px-1 text-xs text-nx-muted opacity-0 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 ${mine ? '' : 'order-last'}`}
                        onClick={() => void state.remove(m.id)}
                      >
                        ✕
                      </button>
                    )}
                    <p className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 ${mine ? 'bg-nx-accent text-nx-accent-text' : 'bg-nx-surface-2'}`}>{m.body}</p>
                  </div>
                ))}
              </div>
            </li>
          )
        })}
      </ol>
      <div ref={end} />
      <form onSubmit={(e) => void submit(e)} className="sticky bottom-0 flex items-end gap-2 border-t border-nx-border bg-nx-surface pt-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          maxLength={TEAM_MESSAGE_MAX}
          placeholder={`Bericht aan ${team.name}`}
          aria-label="Bericht"
          className="min-w-0 flex-1 resize-none rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none"
        />
        <button type="submit" disabled={sending || !text.trim()} className="rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60">
          Versturen
        </button>
      </form>
    </div>
  )
}
