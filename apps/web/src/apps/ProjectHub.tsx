import { useState, useSyncExternalStore, type DragEvent } from 'react'
import {
  addTask,
  blockedBy,
  BOARD_COLUMNS,
  COLUMN_LABELS,
  columnTasks,
  hubProgress,
  liveMilestones,
  liveTasks,
  milestoneProgress,
  moveTask,
  PRIORITY_NAMES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  projectActivity,
  projectMeta,
  projectTimeline,
  removeMilestone,
  removeTask,
  saveMilestone,
  saveProjectMeta,
  setDependency,
  updateTask,
  type BoardColumn,
  type Deadline,
  type HubTask,
  type ProjectHubState,
  type ProjectStatus,
  type TaskPriority,
} from '@nexus/core'
import { lifeStore } from '../life/store'
import { projectHubStore, projectHubSyncProblem, useProjectHub } from '../projecthub/store'
import { readStorage, writeStorage } from '../state/storage'

const TABS = ['Overzicht', 'Bord', 'Tijdlijn', 'Activiteit'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY = 'nexus.projecthub.tab'
const PROJECT_KEY = 'nexus.projecthub.project'
const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const day = (t: number) => new Date(t).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' })
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const pad = (n: number) => String(n).padStart(2, '0')
const dateValue = (t: number | null) => (t === null ? '' : `${new Date(t).getFullYear()}-${pad(new Date(t).getMonth() + 1)}-${pad(new Date(t).getDate())}`)
/** A date from an input, at 23:59 that day. */
function fromDateValue(v: string): number | null {
  if (!v) return null
  const [y, m, d] = v.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59).getTime()
}

/** Applies a change that can fail; returns the error or null. */
function change(apply: (s: ProjectHubState) => ProjectHubState | { error: string }): string | null {
  const next = apply(projectHubStore.getSnapshot())
  if ('error' in next) return next.error
  projectHubStore.update(() => next)
  return null
}

const useLife = () => useSyncExternalStore(lifeStore.subscribe, lifeStore.getSnapshot)

/** Project Hub: the Agenda projects with a board, milestones, a timeline and activity. */
export function ProjectHub() {
  const items = useLife()
  const problem = useSyncExternalStore(projectHubSyncProblem.subscribe, projectHubSyncProblem.getSnapshot)
  const projects = items.flatMap((i) => (i.kind === 'project' && !i.archived ? [i] : [])).sort((a, b) => a.name.localeCompare(b.name, 'nl'))
  const [picked, setPicked] = useState<string | null>(() => readStorage(PROJECT_KEY))
  const [tab, setTabState] = useState<Tab>(() => (TABS.includes(readStorage(TAB_KEY) as Tab) ? (readStorage(TAB_KEY) as Tab) : 'Overzicht'))
  const [name, setName] = useState('')
  const setTab = (t: Tab) => {
    setTabState(t)
    writeStorage(TAB_KEY, t)
  }
  const pick = (id: string) => {
    setPicked(id)
    writeStorage(PROJECT_KEY, id)
  }
  const project = projects.find((p) => p.id === picked) ?? projects[0]
  const create = async () => {
    if (!name.trim()) return
    const id = await lifeStore.addProject(name.trim(), 'blue')
    setName('')
    pick(id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-nx-border px-3 py-2">
        {projects.length > 0 && project && (
          <select aria-label="Project" value={project.id} onChange={(e) => pick(e.target.value)} className={`${field} w-auto max-w-56`}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {project && (
          <div role="tablist" aria-label="Project Hub" className="flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`shrink-0 rounded-md px-3 py-1 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {problem?.startsWith('setup:') && (
          <p role="alert" className="rounded-md border border-amber-500/40 p-2 text-amber-700 dark:text-amber-300">
            Syncen lukt nog niet: voer eenmalig <code>{problem.slice(6)}</code> uit in de SQL Editor van Supabase (of via Account › Database-check).
          </p>
        )}
        {!project ? (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Nog geen project</h2>
            <p className="text-nx-muted">Een project hier is ook een project in de Agenda, met zijn deadlines erbij.</p>
          </div>
        ) : (
          <>
            {tab === 'Overzicht' && <Overview projectId={project.id} name={project.name} items={items} />}
            {tab === 'Bord' && <Board projectId={project.id} />}
            {tab === 'Tijdlijn' && <Timeline projectId={project.id} items={items} />}
            {tab === 'Activiteit' && <Activity projectId={project.id} />}
          </>
        )}
        <form
          className="flex gap-2 border-t border-nx-border pt-3"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <input aria-label="Nieuw project" placeholder="Nieuw project" value={name} onChange={(e) => setName(e.target.value)} className={field} />
          <button type="submit" className={button} disabled={!name.trim()}>
            + Project
          </button>
        </form>
      </div>
    </div>
  )
}

function Overview({ projectId, name, items }: { projectId: string; name: string; items: ReturnType<typeof useLife> }) {
  const state = useProjectHub()
  const meta = projectMeta(state, projectId)
  const [description, setDescription] = useState(meta.description)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const tasks = liveTasks(state, projectId)
  const p = hubProgress(tasks)
  const deadlines = items.filter((i): i is Deadline => i.kind === 'deadline' && i.projectId === projectId && i.doneAt === null)
  const next = tasks.filter((t) => t.column !== 'done').sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || (a.priority === 'high' ? -1 : 0) - (b.priority === 'high' ? -1 : 0)).slice(0, 3)
  const addMilestone = () => {
    const dueAt = fromDateValue(due)
    if (dueAt === null) return setError('Kies een datum voor de mijlpaal.')
    const err = change((s) => saveMilestone(s, { id: crypto.randomUUID(), projectId, title, dueAt }, Date.now()))
    setError(err)
    if (!err) {
      setTitle('')
      setDue('')
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{name}</h2>
        <select aria-label="Status" value={meta.status} onChange={(e) => change((s) => saveProjectMeta(s, projectId, { status: e.target.value as ProjectStatus }, Date.now()))} className={`${field} w-auto`}>
          {PROJECT_STATUSES.map((st) => (
            <option key={st} value={st}>
              {PROJECT_STATUS_LABELS[st]}
            </option>
          ))}
        </select>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-nx-muted">Beschrijving</span>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== meta.description && change((s) => saveProjectMeta(s, projectId, { description }, Date.now()))}
          className={field}
        />
      </label>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-nx-muted">
          <span>
            {p.done} van {p.total} taken klaar
          </span>
          <span>{deadlines.length > 0 ? `${deadlines.length} open ${deadlines.length === 1 ? 'deadline' : 'deadlines'} in de Agenda` : ''}</span>
        </div>
        <div role="progressbar" aria-label={`${name} voortgang`} aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-nx-surface-2">
          <div className="h-full bg-nx-accent" style={{ width: `${p.percent}%` }} />
        </div>
      </div>
      <section aria-label="Volgende taken" className="space-y-1">
        <h3 className="font-medium">Volgende taken</h3>
        {next.length === 0 ? <p className="text-nx-muted">Geen open taken. Voeg er een toe op het Bord.</p> : (
          <ul className="space-y-1">
            {next.map((t) => (
              <li key={t.id} className="flex justify-between gap-2">
                <span>{t.title}</span>
                <span className="text-xs text-nx-muted">{t.dueAt ? day(t.dueAt) : COLUMN_LABELS[t.column]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Mijlpalen" className="space-y-2">
        <h3 className="font-medium">Mijlpalen</h3>
        <ul className="space-y-1">
          {liveMilestones(state, projectId).map((m) => {
            const mp = milestoneProgress(state, m)
            return (
              <li key={m.id} className="flex items-center justify-between gap-2">
                <span>
                  {m.title} <span className="text-xs text-nx-muted">· {day(m.dueAt)} · {mp.done}/{mp.total} taken</span>
                </span>
                <button type="button" className={small} onClick={() => change((s) => removeMilestone(s, m.id, Date.now()))} aria-label={`Mijlpaal ${m.title} weghalen`}>
                  Weghalen
                </button>
              </li>
            )
          })}
        </ul>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            addMilestone()
          }}
        >
          <input aria-label="Mijlpaal" placeholder="Mijlpaal" value={title} onChange={(e) => setTitle(e.target.value)} className={`${field} flex-1`} />
          <input type="date" aria-label="Datum mijlpaal" value={due} onChange={(e) => setDue(e.target.value)} className={`${field} w-40`} />
          <button type="submit" className={button}>
            + Mijlpaal
          </button>
        </form>
        {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
      </section>
    </div>
  )
}

function Board({ projectId }: { projectId: string }) {
  const state = useProjectHub()
  const [title, setTitle] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const add = () => {
    const err = change((s) => addTask(s, projectId, { title }, crypto.randomUUID(), Date.now()))
    setError(err)
    if (!err) setTitle('')
  }
  const drop = (e: DragEvent, column: BoardColumn) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (id) projectHubStore.update((s) => moveTask(s, id, column, Date.now()))
  }
  const selected = state.tasks.find((t) => t.id === open && t.deletedAt === null)
  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input aria-label="Nieuwe taak" placeholder="Nieuwe taak" value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        <button type="submit" className={primaryButton}>
          + Taak
        </button>
      </form>
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {BOARD_COLUMNS.map((column, ci) => (
          <section key={column} aria-label={COLUMN_LABELS[column]} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, column)} className="min-h-24 space-y-2 rounded-lg border border-nx-border bg-nx-surface-2/40 p-2">
            <h3 className="text-xs font-semibold text-nx-muted">
              {COLUMN_LABELS[column]} ({columnTasks(state, projectId, column).length})
            </h3>
            <ul className="space-y-2">
              {columnTasks(state, projectId, column).map((t) => {
                const waits = blockedBy(state, t)
                return (
                  <li key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)} className="space-y-1 rounded-md border border-nx-border bg-nx-surface p-2">
                    <button type="button" className="block w-full text-left font-medium hover:underline" onClick={() => setOpen(open === t.id ? null : t.id)}>
                      {t.title}
                    </button>
                    <p className="text-xs text-nx-muted">
                      {t.priority !== 'normal' && <span className={t.priority === 'high' ? 'text-red-700 dark:text-red-300' : ''}>{PRIORITY_NAMES[t.priority]} · </span>}
                      {t.dueAt ? day(t.dueAt) : ''}
                      {waits.length > 0 && <span className="block text-amber-700 dark:text-amber-300">Wacht op {waits.map((w) => w.title).join(', ')}</span>}
                    </p>
                    <div className="flex gap-1">
                      <button type="button" className={small} disabled={ci === 0} aria-label={`${t.title} naar ${COLUMN_LABELS[BOARD_COLUMNS[ci - 1]] ?? ''}`} onClick={() => projectHubStore.update((s) => moveTask(s, t.id, BOARD_COLUMNS[ci - 1], Date.now()))}>
                        ←
                      </button>
                      <button type="button" className={small} disabled={ci === BOARD_COLUMNS.length - 1} aria-label={`${t.title} naar ${COLUMN_LABELS[BOARD_COLUMNS[ci + 1]] ?? ''}`} onClick={() => projectHubStore.update((s) => moveTask(s, t.id, BOARD_COLUMNS[ci + 1], Date.now()))}>
                        →
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
      {selected && <TaskDetails key={selected.id} task={selected} onClose={() => setOpen(null)} />}
    </div>
  )
}

function TaskDetails({ task, onClose }: { task: HubTask; onClose: () => void }) {
  const state = useProjectHub()
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const others = liveTasks(state, task.projectId).filter((t) => t.id !== task.id)
  const save = (patch: Parameters<typeof updateTask>[2]) => projectHubStore.update((s) => updateTask(s, task.id, patch, Date.now()))
  const toAgenda = async () => {
    if (task.dueAt === null) return setError('Geef de taak eerst een datum.')
    const id = await lifeStore.addDeadline({ title: task.title, dueAt: task.dueAt, projectId: task.projectId, notes: task.notes, remind: [1440], target: 'phone' })
    save({ deadlineId: id })
    setStatus('In de Agenda gezet als deadline.')
  }
  return (
    <section aria-label={`Taak ${task.title}`} className="space-y-3 rounded-lg border border-nx-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Taak</h3>
        <button type="button" className={small} onClick={onClose}>
          Sluiten
        </button>
      </div>
      <input aria-label="Titel" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== task.title && save({ title })} className={field} />
      <textarea aria-label="Notities" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== task.notes && save({ notes })} className={field} />
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-2">
          <span className="text-xs text-nx-muted">Prioriteit</span>
          <select aria-label="Prioriteit" value={task.priority} onChange={(e) => save({ priority: e.target.value as TaskPriority })} className={`${field} w-auto`}>
            {(['low', 'normal', 'high'] as const).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_NAMES[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-xs text-nx-muted">Datum</span>
          <input type="date" aria-label="Datum" value={dateValue(task.dueAt)} onChange={(e) => save({ dueAt: fromDateValue(e.target.value) })} className={`${field} w-40`} />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-xs text-nx-muted">Mijlpaal</span>
          <select aria-label="Mijlpaal" value={task.milestoneId ?? ''} onChange={(e) => save({ milestoneId: e.target.value || null })} className={`${field} w-auto`}>
            <option value="">Geen</option>
            {liveMilestones(state, task.projectId).map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {others.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="text-xs text-nx-muted">Wacht op</legend>
          {others.map((o) => (
            <label key={o.id} className="flex items-center gap-2">
              <input type="checkbox" checked={task.dependsOn.includes(o.id)} onChange={(e) => setError(change((s) => setDependency(s, task.id, o.id, e.target.checked, Date.now())))} />
              {o.title}
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} disabled={task.deadlineId !== null} onClick={() => void toAgenda()}>
          {task.deadlineId ? 'Staat in de Agenda' : 'In Agenda zetten'}
        </button>
        <button
          type="button"
          className={button}
          onClick={() => {
            projectHubStore.update((s) => removeTask(s, task.id, Date.now()))
            onClose()
          }}
        >
          Weghalen
        </button>
        {status && <span role="status" className="text-nx-muted">{status}</span>}
      </div>
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
    </section>
  )
}

function Timeline({ projectId, items }: { projectId: string; items: ReturnType<typeof useLife> }) {
  const state = useProjectHub()
  const deadlines = items.filter((i): i is Deadline => i.kind === 'deadline')
  const entries = projectTimeline(state, projectId, deadlines)
  if (entries.length === 0) return <p className="text-nx-muted">Nog niets met een datum. Geef een taak een datum of voeg een mijlpaal toe in Overzicht.</p>
  const label = { milestone: 'Mijlpaal', task: 'Taak', deadline: 'Deadline' } as const
  return (
    <ol aria-label="Tijdlijn" className="space-y-2 border-l-2 border-nx-border pl-4">
      {entries.map((e) => (
        <li key={`${e.kind}-${e.id}`} className={e.done ? 'text-nx-muted line-through' : ''}>
          <span className="block text-xs text-nx-muted">
            {day(e.at)} · {label[e.kind]}
          </span>
          <span className={e.kind === 'milestone' ? 'font-medium' : ''}>{e.title}</span>
        </li>
      ))}
    </ol>
  )
}

function Activity({ projectId }: { projectId: string }) {
  const state = useProjectHub()
  const log = projectActivity(state, projectId)
  if (log.length === 0) return <p className="text-nx-muted">Nog geen activiteit.</p>
  return (
    <ul aria-label="Activiteit" className="space-y-1">
      {log.map((a) => (
        <li key={a.id} className="flex justify-between gap-2">
          <span>{a.text}</span>
          <span className="shrink-0 text-xs text-nx-muted">{when(a.at)}</span>
        </li>
      ))}
    </ul>
  )
}
