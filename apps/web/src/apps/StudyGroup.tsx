import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import {
  alreadyInAgenda,
  formatInvite,
  groupFeed,
  normalizeInvite,
  openGroupTasks,
  shareableItems,
  taskProgress,
  SHARED_KIND_LABELS,
  type GroupMember,
  type GroupTask,
  type SharedItem,
  type StudyGroup,
} from '@nexus/core'
import { lifeStore } from '../life/store'
import { readStorage, writeStorage } from '../state/storage'
import { supabase } from '../sync/supabase'
import { StudyGroups, suggestedName } from '../study/group'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const PICKED_KEY = 'nexus.studygroup.picked'
const REFRESH_MS = 60_000

const defaultGroups = supabase ? new StudyGroups(supabase) : null
const clock = (t: number) => new Date(t).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
const dayTitle = (t: number) => {
  const word = new Date(t).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })
  return word.charAt(0).toUpperCase() + word.slice(1)
}
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

function SetupHint({ problem }: { problem: string }) {
  return (
    <p className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">
      De studiegroep heeft nog een stap in de database nodig. Voer <code className="font-mono text-xs">{problem.slice(6)}</code> uit in de SQL Editor van Supabase.
    </p>
  )
}

/** Studiegroep: share deadlines, exams and study time with friends, and see theirs. */
export function StudyGroupTab({ groups = defaultGroups }: { groups?: StudyGroups | null }) {
  const life = useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)
  const [me, setMe] = useState<{ id: string; email: string | undefined } | null | undefined>(undefined)
  const [list, setList] = useState<StudyGroup[] | null>(null)
  const [picked, setPicked] = useState<string | null>(() => readStorage(PICKED_KEY))
  const [members, setMembers] = useState<GroupMember[]>([])
  const [items, setItems] = useState<SharedItem[]>([])
  const [tasks, setTasks] = useState<GroupTask[]>([])
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'create' | 'join' | null>(null)
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [leaving, setLeaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const now = Date.now()

  const group = list?.find((g) => g.id === picked) ?? list?.[0] ?? null

  const refreshList = useCallback(async () => {
    if (!groups) return
    try {
      const user = await groups.me()
      setMe(user)
      if (!user) return
      setDisplayName((d) => d || suggestedName(user.email))
      setList(await groups.groups())
      setProblem(null)
    } catch (err) {
      setProblem(message(err))
    }
  }, [groups])

  const refreshGroup = useCallback(async () => {
    if (!groups || !group) return
    try {
      const data = await groups.load(group.id)
      setMembers(data.members)
      setItems(data.items)
      setTasks(data.tasks)
    } catch (err) {
      setProblem(message(err))
    }
  }, [groups, group])

  useEffect(() => void refreshList(), [refreshList])
  useEffect(() => {
    void refreshGroup()
    // Live updates; the slow poll also catches deletions, which realtime filters don't report.
    const t = setInterval(() => void refreshGroup(), REFRESH_MS)
    let debounce: ReturnType<typeof setTimeout> | undefined
    const stop = groups && group ? groups.watch(group.id, () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void refreshGroup(), 300)
    }) : () => {}
    return () => {
      clearInterval(t)
      clearTimeout(debounce)
      stop()
    }
  }, [refreshGroup, groups, group])

  const pick = (id: string) => {
    setPicked(id)
    writeStorage(PICKED_KEY, id)
    setLeaving(false)
  }

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    try {
      await work()
      setProblem(null)
    } catch (err) {
      setProblem(message(err))
    } finally {
      setBusy(false)
    }
  }

  if (!groups) return <p className="text-nx-muted">Een studiegroep werkt met een account. Deze versie van NEXUS heeft geen verbinding met Supabase.</p>
  if (me === null) return <p className="text-nx-muted">Meld je aan in Account om een studiegroep te maken of er lid van te worden.</p>
  if (me === undefined || (list === null && !problem)) return <p className="text-nx-muted">Laden…</p>

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      if (mode === 'create') {
        const g = await groups.create(name, displayName)
        pick(g.id)
      } else {
        const normalized = normalizeInvite(code)
        if (!normalized) throw new Error('Een uitnodigingscode heeft 8 letters en cijfers, bv. ABCD-EF23.')
        const g = await groups.join(normalized, displayName)
        if (!g) throw new Error('Geen groep gevonden met die code.')
        pick(g.id)
      }
      setMode(null)
      setName('')
      setCode('')
      await refreshList()
    })
  }

  const form = mode && (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-nx-border p-3">
      {mode === 'create' ? (
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Naam van de groep, bv. 1IT3 projectgroep" aria-label="Naam van de groep" className={field} />
      ) : (
        <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} placeholder="Uitnodigingscode, bv. ABCD-EF23" aria-label="Uitnodigingscode" className={`${field} font-mono uppercase`} />
      )}
      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} placeholder="Je naam in de groep" aria-label="Je naam in de groep" className={field} />
      <p className="text-xs text-nx-muted">Je e-mailadres blijft verborgen. De groep ziet alleen deze naam en wat je zelf deelt.</p>
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={busy || !displayName.trim() || (mode === 'create' ? !name.trim() : !code.trim())}>
          {mode === 'create' ? 'Groep maken' : 'Lid worden'}
        </button>
        <button type="button" className={button} onClick={() => setMode(null)}>
          Annuleren
        </button>
      </div>
    </form>
  )

  const shared = new Set(items.filter((i) => i.userId === me.id).map((i) => i.sourceId))
  const offer = shareableItems(life, now)
  const feed = group ? groupFeed(items, members, me.id, now) : []

  return (
    <>
      {problem?.startsWith('setup:') ? <SetupHint problem={problem} /> : problem && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">{problem}</p>}
      <p className="text-nx-muted">Deel je deadlines, examens en geplande studietijd met vrienden en zie wat zij moeten doen. Je kiest zelf wat je deelt; andere afspraken en je notities blijven privé.</p>
      {list && list.length > 1 && (
        <select value={group?.id ?? ''} onChange={(e) => pick(e.target.value)} aria-label="Studiegroep" className={field}>
          {list.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      )}
      {form ?? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={list?.length ? button : primaryButton} onClick={() => setMode('create')}>
            + Nieuwe groep
          </button>
          <button type="button" className={button} onClick={() => setMode('join')}>
            Lid worden met een code
          </button>
        </div>
      )}
      {list?.length === 0 && !mode && <p className="text-nx-muted">Je zit nog in geen studiegroep. Maak er een en stuur de code naar je vrienden, of vul de code in die je kreeg.</p>}
      {group && (
        <>
          <section className="space-y-2 rounded-lg border border-nx-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 flex-1 font-medium">{group.name}</h3>
              <span className="font-mono text-xs" aria-label="Uitnodigingscode">
                {formatInvite(group.inviteCode)}
              </span>
              <button
                type="button"
                className={small}
                onClick={() =>
                  void navigator.clipboard?.writeText(formatInvite(group.inviteCode)).then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  })
                }
              >
                {copied ? 'Gekopieerd' : 'Code kopiëren'}
              </button>
            </div>
            <p className="text-xs text-nx-muted">
              {members.length} {members.length === 1 ? 'lid' : 'leden'}: {members.map((m) => (m.userId === me.id ? `${m.displayName} (jij)` : m.displayName)).join(', ')}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium">Groepsdeadlines</h3>
            <p className="text-xs text-nx-muted">Een deadline voor iedereen in de groep, bv. een groepsopdracht. Elk lid vinkt ze voor zichzelf af; je ziet wie al klaar is.</p>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const due = Date.parse(taskDue)
                void run(async () => {
                  if (!Number.isFinite(due)) throw new Error('Kies een datum en uur voor de groepsdeadline.')
                  await groups.addTask(group.id, taskTitle, due)
                  setTaskTitle('')
                  setTaskDue('')
                  await refreshGroup()
                })
              }}
            >
              <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} maxLength={160} placeholder="Bv. Verslag groepsproject" aria-label="Titel van de groepsdeadline" className={`${field} flex-1`} />
              <input type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} aria-label="Wanneer" className={`${field} w-auto`} />
              <button type="submit" className={button} disabled={busy || !taskTitle.trim() || !taskDue}>
                Toevoegen
              </button>
            </form>
            {openGroupTasks(tasks, now).length === 0 && <p className="text-nx-muted">Nog geen groepsdeadlines.</p>}
            <ul className="space-y-1">
              {openGroupTasks(tasks, now).map((t) => {
                const p = taskProgress(t, members, me.id)
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border px-3 py-2">
                    <input
                      type="checkbox"
                      checked={p.mine}
                      disabled={busy}
                      aria-label={`${t.title} klaar`}
                      onChange={(e) =>
                        void run(async () => {
                          await groups.setTaskDone(t, e.target.checked)
                          await refreshGroup()
                        })
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block ${p.mine ? 'text-nx-muted line-through' : ''}`}>{t.title}</span>
                      <span className="block text-xs text-nx-muted">
                        {dayTitle(t.dueAt)} om {clock(t.dueAt)} · {p.done} van {p.total} klaar{p.names.length > 0 && `: ${p.names.join(', ')}`}
                      </span>
                    </span>
                    {!alreadyInAgenda({ title: t.title, at: t.dueAt }, life) && (
                      <button type="button" className={small} disabled={busy} onClick={() => void run(async () => void (await groups.takeOver({ title: t.title, at: t.dueAt })))}>
                        In mijn Agenda
                      </button>
                    )}
                    {t.createdBy === me.id && (
                      <button
                        type="button"
                        className={small}
                        disabled={busy}
                        aria-label={`Groepsdeadline ${t.title} verwijderen`}
                        onClick={() =>
                          void run(async () => {
                            await groups.removeTask(t.id)
                            await refreshGroup()
                          })
                        }
                      >
                        Verwijderen
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium">Wat eraan komt</h3>
            {feed.length === 0 && <p className="text-nx-muted">Nog niets gedeeld in deze groep.</p>}
            {feed.map((d) => (
              <div key={d.day} className="space-y-1">
                <p className="text-xs font-medium text-nx-muted">{dayTitle(d.day)}</p>
                <ul className="space-y-1">
                  {d.entries.map((e) => (
                    <li key={`${e.userId}:${e.sourceId}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border px-3 py-2">
                      <span className="w-12 shrink-0 tabular-nums text-nx-muted">{clock(e.at)}</span>
                      <span className={`min-w-0 flex-1 ${e.done ? 'text-nx-muted line-through' : ''}`}>
                        <span className="block">{e.title}</span>
                        <span className="block text-xs text-nx-muted">
                          {SHARED_KIND_LABELS[e.kind]} · {e.who}
                          {e.done && ' · klaar'}
                        </span>
                      </span>
                      {!e.mine && e.kind === 'deadline' && !e.done && !alreadyInAgenda(e, life) && (
                        <button type="button" className={small} disabled={busy} onClick={() => void run(async () => void (await groups.takeOver(e)))}>
                          In mijn Agenda
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <h3 className="font-medium">Wat jij deelt</h3>
            {offer.length === 0 && <p className="text-nx-muted">Je hebt geen open deadlines, examens of geplande studietijd om te delen.</p>}
            <ul className="space-y-1">
              {offer.map((o) => (
                <li key={o.sourceId}>
                  <label className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-nx-surface-2">
                    <input
                      type="checkbox"
                      checked={shared.has(o.sourceId)}
                      disabled={busy}
                      onChange={(e) =>
                        void run(async () => {
                          if (e.target.checked) await groups.share(group.id, o.sourceId)
                          else await groups.unshare(group.id, o.sourceId)
                          await refreshGroup()
                        })
                      }
                    />
                    <span className="min-w-0 flex-1">{o.title}</span>
                    <span className="shrink-0 text-xs text-nx-muted">
                      {SHARED_KIND_LABELS[o.kind]} · {new Date(o.at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })} {clock(o.at)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-xs text-nx-muted">Verschuif of vink je iets af in je Agenda, dan ziet de groep dat ook. Wat je verwijdert, verdwijnt uit de groep.</p>
          </section>

          <div className="flex gap-2">
            {leaving ? (
              <>
                <button
                  type="button"
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await groups.leave(group.id)
                      setLeaving(false)
                      setMembers([])
                      setItems([])
                      setTasks([])
                      await refreshList()
                    })
                  }
                >
                  Ja, verlaat {group.name}
                </button>
                <button type="button" className={button} onClick={() => setLeaving(false)}>
                  Annuleren
                </button>
              </>
            ) : (
              <button type="button" className={button} onClick={() => setLeaving(true)}>
                Groep verlaten
              </button>
            )}
          </div>
          {leaving && <p className="text-xs text-nx-muted">Wat je in deze groep deelde, verdwijnt mee. Je kunt later opnieuw lid worden met de code.</p>}
        </>
      )}
    </>
  )
}
