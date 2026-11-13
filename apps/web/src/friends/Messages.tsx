import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { conversations, DM_TEXT_MAX, type DirectMessage, type FriendEntry } from '@nexus/core'
import { setOpenConversation, type DirectMessages } from './dm'

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const UNREADABLE = 'Niet te lezen op dit toestel: het werd verstuurd voor dit toestel aan je account gekoppeld was.'

/** By id, in time order: realtime and a reload can bring the same message. */
const merge = (a: DirectMessage[], b: DirectMessage[]): DirectMessage[] => {
  const byId = new Map<string, DirectMessage>()
  for (const m of [...a, ...b]) byId.set(m.id, m)
  return [...byId.values()].sort((x, y) => x.createdAt - y.createdAt)
}

/** Vrienden › Berichten: your conversations with friends, end-to-end encrypted. */
export function Messages({ dms, me, friends, sealed }: { dms: DirectMessages; me: string; friends: FriendEntry[]; sealed: boolean }) {
  const [all, setAll] = useState<DirectMessage[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setAll(await dms.recent())
      setProblem(null)
    } catch (err) {
      setProblem(message(err))
    }
  }, [dms])

  useEffect(() => {
    void refresh()
    const stop = dms.watch((m) => setAll((old) => merge(old.filter((o) => o.id !== m.id), [m])))
    const t = setInterval(() => void refresh(), 60_000)
    return () => {
      stop()
      clearInterval(t)
    }
  }, [dms, refresh])

  const accepted = friends.filter((f) => f.kind === 'friend')
  const friend = accepted.find((f) => f.userId === open)
  const setup = problem?.startsWith('setup:')

  return (
    <div className="space-y-3">
      {setup ? (
        <p role="alert" className="rounded-md border border-amber-500/40 p-2 text-amber-700 dark:text-amber-300">
          Privéberichten hebben nog een stap in de database nodig: voer eenmalig <code>{problem!.slice(6)}</code> uit in de SQL Editor van Supabase (of via Account › Database-check).
        </p>
      ) : (
        problem && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">{problem}</p>
      )}
      {!sealed && <p className="rounded-md border border-amber-500/40 p-2 text-xs">Privéberichten worden versleuteld met de sleutel van dit toestel in NEXUS Connect. Die is nog niet klaar: kijk bij Apparaten.</p>}
      {friend ? (
        <Conversation dms={dms} me={me} friend={friend} all={all} setAll={setAll} onBack={() => setOpen(null)} setProblem={setProblem} />
      ) : (
        <>
          <p className="text-xs text-nx-muted">Berichten zijn end-to-end versleuteld: alleen jullie toestellen kunnen ze lezen, NEXUS zelf niet.</p>
          {accepted.length === 0 && <p className="text-nx-muted">Voeg eerst een vriend toe bij Vrienden.</p>}
          <ul className="space-y-1">
            {conversations(
              accepted.map((f) => f.userId),
              all,
              me,
            ).map((c) => {
              const f = accepted.find((x) => x.userId === c.friendId)!
              return (
                <li key={c.friendId}>
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg border border-nx-border px-3 py-2 text-left hover:bg-nx-surface-2" onClick={() => setOpen(c.friendId)}>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{f.displayName}</span>
                      <span className="block truncate text-xs text-nx-muted">{c.last ? `${c.last.sender === me ? 'Jij: ' : ''}${c.last.text ?? 'Versleuteld bericht'}` : 'Nog geen berichten'}</span>
                    </span>
                    {c.unread > 0 && (
                      <span className="rounded-full bg-nx-accent px-1.5 text-xs text-nx-accent-text" aria-label={`${c.unread} ongelezen`}>
                        {c.unread}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

function Conversation({
  dms,
  me,
  friend,
  all,
  setAll,
  onBack,
  setProblem,
}: {
  dms: DirectMessages
  me: string
  friend: FriendEntry
  all: DirectMessage[]
  setAll: (f: (old: DirectMessage[]) => DirectMessage[]) => void
  onBack: () => void
  setProblem: (p: string | null) => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const messages = all.filter((m) => (m.sender === friend.userId && m.recipient === me) || (m.sender === me && m.recipient === friend.userId))
  const last = messages[messages.length - 1]
  const unread = messages.some((m) => m.sender === friend.userId && m.readAt === null)

  useEffect(() => {
    setOpenConversation(friend.userId)
    void dms.conversation(me, friend.userId).then(
      (list) => setAll((old) => merge(old, list)),
      (err: unknown) => setProblem(message(err)),
    )
    return () => setOpenConversation(null)
  }, [dms, me, friend.userId, setAll, setProblem])
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' })
  }, [last?.id])
  useEffect(() => {
    if (!unread) return
    void dms.markRead(friend.userId).then(() => setAll((old) => old.map((m) => (m.sender === friend.userId && m.readAt === null ? { ...m, readAt: Date.now() } : m))), () => {})
  }, [dms, friend.userId, unread, setAll])

  const send = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const sent = await dms.send(friend.userId, text)
      if (sent) setAll((old) => merge(old, [sent]))
      setText('')
      setProblem(null)
    } catch (err) {
      setProblem(message(err))
    } finally {
      setSending(false)
    }
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="flex min-h-[18rem] flex-col gap-2">
      <div className="flex items-center gap-2">
        <button type="button" className="rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2" onClick={onBack}>
          ← Berichten
        </button>
        <h3 className="font-medium">{friend.displayName}</h3>
        <span className="text-xs text-nx-muted">🔒 end-to-end versleuteld</span>
      </div>
      {messages.length === 0 && <p className="text-nx-muted">Nog geen berichten. Alleen jij en {friend.displayName} kunnen lezen wat je hier schrijft.</p>}
      <ol aria-label={`Gesprek met ${friend.displayName}`} className="space-y-1.5">
        {messages.map((m) => {
          const mine = m.sender === me
          return (
            <li key={m.id} className={`group flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div className="flex max-w-[85%] items-center gap-1">
                {mine && (
                  <button type="button" aria-label={`Bericht van ${when(m.createdAt)} verwijderen`} className="rounded px-1 text-xs text-nx-muted opacity-0 hover:text-red-600 focus:opacity-100 group-hover:opacity-100" onClick={() => void dms.remove(m.id).then(() => setAll((old) => old.filter((o) => o.id !== m.id)), (err: unknown) => setProblem(message(err)))}>
                    ✕
                  </button>
                )}
                <p className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 ${m.text === null ? 'italic text-nx-muted' : ''} ${mine ? 'bg-nx-accent text-nx-accent-text' : 'bg-nx-surface-2'}`}>{m.text ?? UNREADABLE}</p>
              </div>
              <span className="px-1 text-[11px] text-nx-muted">
                {when(m.createdAt)}
                {mine && m === last && m.readAt !== null && ' · gelezen'}
              </span>
            </li>
          )
        })}
      </ol>
      <div ref={end} />
      <div className="sticky bottom-0 flex items-end gap-2 border-t border-nx-border bg-nx-surface pt-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} rows={2} maxLength={DM_TEXT_MAX} placeholder={`Bericht aan ${friend.displayName}`} aria-label="Privébericht" className="min-w-0 flex-1 resize-none rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none" />
        <button type="button" disabled={sending || !text.trim()} onClick={() => void send()} className="rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60">
          Versturen
        </button>
      </div>
    </div>
  )
}
