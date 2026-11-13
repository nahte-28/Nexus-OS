import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  commentCounts,
  completeMention,
  findMentions,
  memberName,
  mentionParts,
  mentionQuery,
  mentionSuggestions,
  TASK_COMMENT_MAX,
  teamCan,
  type CommentTarget,
  type GroupMember,
  type TaskComment,
  type TeamRole,
} from '@nexus/core'
import type { TaskComments } from './comments'

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'

/** How many comments each task of a team has, kept up to date while the app is open. */
export function useCommentCounts(api: TaskComments | null, groupId: string | null): { counts: Map<string, number>; refresh: () => void } {
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const refresh = useCallback(() => {
    if (!api || !groupId) return
    // Without the SQL step there are no counts yet; the thread itself shows what to do.
    api.counted(groupId).then((list) => setCounts(commentCounts(list)), () => setCounts(new Map()))
  }, [api, groupId])
  useEffect(() => {
    setCounts(new Map())
    if (!api || !groupId) return
    refresh()
    const stop = api.watch(groupId, (c) => setCounts((old) => new Map(old).set(c.target.taskId, (old.get(c.target.taskId) ?? 0) + 1)))
    const t = setInterval(refresh, 60_000)
    return () => {
      stop()
      clearInterval(t)
    }
  }, [api, groupId, refresh])
  return { counts, refresh }
}

/** The button under a task that opens its comments, with the number there already. */
export function CommentsButton({ count, open, title, onClick }: { count: number; open: boolean; title: string; onClick: () => void }) {
  return (
    <button type="button" className={small} aria-expanded={open} aria-label={`Opmerkingen bij ${title}${count > 0 ? ` (${count})` : ''}`} onClick={onClick}>
      💬 {count > 0 ? count : 'Opmerking'}
    </button>
  )
}

/** The comments of one task, with a field that suggests members after @. */
export function TaskCommentThread({
  api,
  groupId,
  target,
  members,
  me,
  role,
  onChange,
}: {
  api: TaskComments
  groupId: string
  target: CommentTarget
  members: GroupMember[]
  me: string
  role: TeamRole | null
  onChange?: () => void
}) {
  const [comments, setComments] = useState<TaskComment[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const [busy, setBusy] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const { kind, taskId } = target

  useEffect(() => {
    let live = true
    api.load({ kind, taskId } as CommentTarget).then(
      (list) => live && setComments(list),
      (err: unknown) => live && setProblem(message(err)),
    )
    const stop = api.watch(groupId, (c) => {
      if (c.target.taskId === taskId) setComments((old) => (old?.some((o) => o.id === c.id) ? old : [...(old ?? []), c]))
    })
    return () => {
      live = false
      stop()
    }
  }, [api, groupId, kind, taskId])

  const at = mentionQuery(text, caret)
  const suggestions = at ? mentionSuggestions(members, at.query, me) : []
  const pickMention = (name: string) => {
    if (!at) return
    const next = completeMention(text, at, name)
    setText(next.text)
    setCaret(next.caret)
    requestAnimationFrame(() => {
      field.current?.focus()
      field.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  const send = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      const added = await api.add(groupId, target, text, findMentions(text, members, me))
      setComments((old) => (old?.some((o) => o.id === added.id) ? old : [...(old ?? []), added]))
      setText('')
      setCaret(0)
      setProblem(null)
      onChange?.()
    } catch (err) {
      setProblem(message(err))
    } finally {
      setBusy(false)
    }
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (suggestions.length > 0) pickMention(suggestions[0].displayName)
      else void send()
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-nx-border bg-nx-surface-2/50 p-2 text-sm">
      {problem?.startsWith('setup:') ? (
        <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">
          Opmerkingen hebben nog een stap in de database nodig: voer eenmalig <code>{problem.slice(6)}</code> uit in de SQL Editor van Supabase (of via Account › Database-check).
        </p>
      ) : (
        problem && <p role="alert" className="text-xs text-red-600">{problem}</p>
      )}
      {comments === null && !problem && <p className="text-xs text-nx-muted">Laden…</p>}
      {comments?.length === 0 && <p className="text-xs text-nx-muted">Nog geen opmerkingen. Typ @ om iemand van het team te vermelden.</p>}
      <ul className="space-y-1.5">
        {comments?.map((c) => (
          <li key={c.id} className="group space-y-0.5">
            <p className="text-xs text-nx-muted">
              {c.userId === me ? 'Jij' : memberName(members, c.userId, me)} · {when(c.createdAt)}
              {(c.userId === me || teamCan(role, 'manage')) && (
                <button
                  type="button"
                  className="ml-2 opacity-0 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                  aria-label={`Opmerking van ${when(c.createdAt)} verwijderen`}
                  onClick={() =>
                    void api.remove(c.id).then(
                      () => {
                        setComments((old) => old?.filter((o) => o.id !== c.id) ?? null)
                        onChange?.()
                      },
                      (err: unknown) => setProblem(message(err)),
                    )
                  }
                >
                  ✕
                </button>
              )}
            </p>
            <p className="whitespace-pre-wrap break-words">
              {mentionParts(c.body, members).map((p, i) =>
                p.userId ? (
                  <strong key={i} className={p.userId === me ? 'rounded bg-nx-accent/20 px-0.5' : ''}>
                    {p.text}
                  </strong>
                ) : (
                  <span key={i}>{p.text}</span>
                ),
              )}
            </p>
          </li>
        ))}
      </ul>
      <div className="relative">
        {suggestions.length > 0 && (
          <ul role="listbox" aria-label="Vermelden" className="absolute bottom-full left-0 z-10 mb-1 w-56 rounded-md border border-nx-border bg-nx-surface p-1 shadow">
            {suggestions.map((m, i) => (
              <li key={m.userId} role="option" aria-selected={i === 0}>
                <button type="button" className="w-full rounded px-2 py-1 text-left hover:bg-nx-surface-2" onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(m.displayName)}>
                  @{m.displayName}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={field}
            value={text}
            rows={2}
            maxLength={TASK_COMMENT_MAX}
            aria-label="Opmerking"
            placeholder="Schrijf een opmerking, @ om iemand te vermelden"
            onChange={(e) => {
              setText(e.target.value)
              setCaret(e.target.selectionStart ?? e.target.value.length)
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKey}
            className="min-w-0 flex-1 resize-none rounded-md border border-nx-border bg-nx-surface px-2 py-1 text-sm outline-none"
          />
          <button type="button" className={small} disabled={busy || !text.trim()} onClick={() => void send()}>
            Plaatsen
          </button>
        </div>
      </div>
    </div>
  )
}
