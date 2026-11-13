import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  canRemove,
  formatTeamCode,
  INVITE_DURATIONS,
  inviteState,
  inviteSummary,
  memberName,
  normalizeKlas,
  myTeamTasks,
  normalizeTeamCode,
  roleChoices,
  sortMembers,
  teamBoard,
  teamCan,
  teamProjectProgress,
  TEAM_ROLE_HELP,
  TEAM_ROLE_LABELS,
  TEAM_ROLES,
  TEAM_TASK_STATUS_LABELS,
  TEAM_TASK_STATUSES,
  type ClassTeam,
  type StudyGroup,
  type TeamInvite,
  type TeamMember,
  type TeamProject,
  type TeamProjectTask,
  type TeamRole,
} from '@nexus/core'
import { readStorage, writeStorage } from '../state/storage'
import { supabase } from '../sync/supabase'
import { suggestedName } from '../study/group'
import { classAgendaFor, classAgendaStore, useClassAgenda } from '../study/classAgenda'
import { Teams as TeamsApi } from '../teams/teams'
import { clearPendingJoin, joinLink, pendingJoin } from '../teams/joinLink'
import { TeamChat } from '../teams/chat'
import { TaskComments } from '../teams/comments'
import { CommentsButton, TaskCommentThread, useCommentCounts } from '../teams/TaskCommentsPanel'
import { TeamChatPanel, useTeamChat } from '../teams/TeamChatPanel'
import { profilesStore, useProfiles } from '../profiles/store'

const TABS = ['Projecten', 'Chat', 'Leden', 'Uitnodigingen', 'Instellingen'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY = 'nexus.teams.tab'
const PICKED_KEY = 'nexus.teams.picked'
const REFRESH_MS = 60_000
const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const danger = 'rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60'
const pill = 'rounded-full border border-nx-border px-2 py-0.5 text-xs text-nx-muted'
const USES = [null, 1, 5, 10, 30] as const

const defaultApi = supabase ? new TeamsApi(supabase) : null
const defaultChat = supabase ? new TeamChat(supabase) : null
const defaultComments = supabase ? new TaskComments(supabase) : null
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
/** A datetime-local value for a moment, in local time. */
const localInput = (t: number | null) => {
  if (t === null) return ''
  const d = new Date(t)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function SetupHint({ problem }: { problem: string }) {
  return (
    <p role="alert" className="rounded-md border border-amber-500/40 p-2 text-amber-700 dark:text-amber-300">
      {problem.includes('class_teams') ? 'Klasteams hebben' : 'Teams heeft'} nog een stap in de database nodig: voer eenmalig <code>{problem.slice(6)}</code> uit in de SQL Editor van Supabase (of via Account › Database-check).
    </p>
  )
}

interface TeamData {
  members: TeamMember[]
  invites: TeamInvite[]
  projects: TeamProject[]
  tasks: TeamProjectTask[]
}
const EMPTY: TeamData = { members: [], invites: [], projects: [], tasks: [] }

/** Teams: your study groups with roles, invitations that expire and projects you work on together. */
export function Teams({ api = defaultApi, chat = defaultChat, comments = defaultComments }: { api?: TeamsApi | null; chat?: TeamChat | null; comments?: TaskComments | null }) {
  const [me, setMe] = useState<{ id: string; email: string | undefined } | null | undefined>(undefined)
  const [list, setList] = useState<StudyGroup[] | null>(null)
  const [picked, setPicked] = useState<string | null>(() => readStorage(PICKED_KEY))
  const [data, setData] = useState<TeamData>(EMPTY)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [linkCode] = useState(pendingJoin)
  const [mode, setModeState] = useState<'create' | 'join' | 'class' | null>(linkCode ? 'join' : null)
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState(linkCode ?? '')
  const setMode = (m: 'create' | 'join' | 'class' | null) => {
    if (m !== 'join') clearPendingJoin()
    setModeState(m)
  }
  const [tab, setTabState] = useState<Tab>(() => (TABS.includes(readStorage(TAB_KEY) as Tab) ? (readStorage(TAB_KEY) as Tab) : 'Projecten'))
  const setTab = (t: Tab) => {
    setTabState(t)
    writeStorage(TAB_KEY, t)
  }

  const team = list?.find((g) => g.id === picked) ?? list?.[0] ?? null
  const myRole: TeamRole | null = data.members.find((m) => m.userId === me?.id && m.groupId === team?.id)?.role ?? null
  const chatState = useTeamChat(chat, team, me?.id)

  const refreshList = useCallback(async () => {
    if (!api) return
    try {
      const user = await api.me()
      setMe(user)
      if (!user) return
      setDisplayName((d) => d || suggestedName(user.email))
      setList(await api.teams())
      setProblem(null)
    } catch (err) {
      setProblem(message(err))
    }
  }, [api])

  const refreshTeam = useCallback(async () => {
    if (!api || !team || !me) return
    try {
      // Invitations are for the owner and admins only; ask for them once the role is known.
      const first = await api.load(team.id, false)
      const role = first.members.find((m) => m.userId === me.id)?.role
      setData(teamCan(role, 'manage') ? await api.load(team.id, true) : first)
    } catch (err) {
      setProblem(message(err))
    }
  }, [api, team, me])

  useEffect(() => void refreshList(), [refreshList])
  useEffect(() => {
    void refreshTeam()
    // Live updates; the slow poll also catches deletions, which realtime filters don't report.
    const t = setInterval(() => void refreshTeam(), REFRESH_MS)
    let debounce: ReturnType<typeof setTimeout> | undefined
    const stop = api && team ? api.watch(team.id, () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void refreshTeam(), 300)
    }) : () => {}
    return () => {
      clearInterval(t)
      clearTimeout(debounce)
      stop()
    }
  }, [refreshTeam, api, team])

  const pick = (id: string) => {
    setPicked(id)
    writeStorage(PICKED_KEY, id)
    setData(EMPTY)
  }

  const run = async (work: () => Promise<unknown>, after: 'team' | 'list' = 'team') => {
    setBusy(true)
    try {
      await work()
      setProblem(null)
      await (after === 'team' ? refreshTeam() : refreshList())
    } catch (err) {
      setProblem(message(err))
    } finally {
      setBusy(false)
    }
  }

  if (!api) return <p className="p-4 text-sm text-nx-muted">Teams werkt met een account. Deze versie van NEXUS heeft geen verbinding met Supabase.</p>
  if (me === null) return <p className="p-4 text-sm text-nx-muted">Meld je aan in Account om een team te maken of erbij te komen.</p>
  if (me === undefined || (list === null && !problem)) return <p className="p-4 text-sm text-nx-muted">Laden…</p>

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      if (mode === 'create') {
        pick((await api.create(name, displayName)).id)
      } else {
        const normalized = normalizeTeamCode(code)
        if (!normalized) throw new Error('Een code heeft 8 of 10 letters en cijfers, bv. ABCDE-FGH23.')
        const g = await api.join(normalized, displayName)
        if (!g) throw new Error('Geen team gevonden met die code.')
        pick(g.id)
        clearPendingJoin()
      }
      setMode(null)
      setName('')
      setCode('')
    }, 'list')
  }

  const tabs = TABS.filter((t) => t !== 'Uitnodigingen' || teamCan(myRole, 'manage'))
  const shown = tabs.includes(tab) ? tab : 'Projecten'

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div className="space-y-2 border-b border-nx-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          {list && list.length > 0 && (
            <select value={team?.id ?? ''} onChange={(e) => pick(e.target.value)} aria-label="Team" className={`${field} w-auto flex-1`}>
              {list.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          {myRole && <span className={pill}>{TEAM_ROLE_LABELS[myRole]}</span>}
          <button type="button" className={list?.length ? small : primaryButton} onClick={() => setMode('create')}>
            + Nieuw team
          </button>
          <button type="button" className={small} onClick={() => setMode('join')}>
            Aansluiten met een code
          </button>
          <button type="button" className={small} onClick={() => setMode(mode === 'class' ? null : 'class')} aria-expanded={mode === 'class'}>
            Teams van je klas
          </button>
        </div>
        {mode === 'class' && (
          <ClassTeams
            api={api}
            displayName={displayName}
            setDisplayName={setDisplayName}
            busy={busy}
            onJoined={(id) => {
              pick(id)
              setMode(null)
              void refreshList()
            }}
          />
        )}
        {mode && mode !== 'class' && (
          <form onSubmit={submit} className="space-y-2 rounded-lg border border-nx-border p-3">
            {mode === 'join' && linkCode && <p className="text-xs">Je opende een uitnodigingslink. Kies je naam in het team en tik op Aansluiten.</p>}
            {mode === 'create' ? (
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Naam van het team, bv. Projectgroep IoT" aria-label="Naam van het team" className={field} />
            ) : (
              <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={14} placeholder="Code, bv. ABCDE-FGH23" aria-label="Code" className={`${field} font-mono uppercase`} />
            )}
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} placeholder="Je naam in het team" aria-label="Je naam in het team" className={field} />
            <p className="text-xs text-nx-muted">Je e-mailadres blijft verborgen. Het team ziet alleen deze naam.</p>
            <div className="flex gap-2">
              <button type="submit" className={primaryButton} disabled={busy || !displayName.trim() || (mode === 'create' ? !name.trim() : !code.trim())}>
                {mode === 'create' ? 'Team maken' : 'Aansluiten'}
              </button>
              <button type="button" className={button} onClick={() => setMode(null)}>
                Annuleren
              </button>
            </div>
          </form>
        )}
      </div>
      {team && (
        <div role="tablist" aria-label="Teams" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
          {tabs.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={shown === t} onClick={() => setTab(t)} className={`shrink-0 rounded-md px-3 py-1 ${shown === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}>
              {t}
              {t === 'Chat' && shown !== 'Chat' && chatState.unread > 0 && (
                <span className="ml-1 rounded-full bg-nx-accent px-1.5 text-xs text-nx-accent-text" aria-label={`${chatState.unread} ongelezen`}>
                  {chatState.unread > 99 ? '99+' : chatState.unread}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {problem?.startsWith('setup:') ? <SetupHint problem={problem} /> : problem && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">{problem}</p>}
        {list?.length === 0 && !mode && (
          <p className="text-nx-muted">Je zit nog in geen team. Een team is een studiegroep met rollen en gedeelde projecten: maak er een, of sluit aan met de code die je kreeg.</p>
        )}
        {team && shown === 'Projecten' && <Projects api={api} comments={comments} team={team} data={data} me={me.id} role={myRole} busy={busy} run={run} />}
        {team && shown === 'Chat' && <TeamChatPanel team={team} members={data.members} me={me.id} role={myRole} state={chatState} />}
        {team && shown === 'Leden' && <Members api={api} team={team} data={data} me={me.id} role={myRole} busy={busy} run={run} />}
        {team && shown === 'Uitnodigingen' && <Invites api={api} team={team} data={data} role={myRole} busy={busy} run={run} />}
        {team && shown === 'Instellingen' && <Settings api={api} team={team} role={myRole} busy={busy} run={run} onGone={() => setData(EMPTY)} />}
      </div>
    </div>
  )
}

interface PartProps {
  api: TeamsApi
  team: StudyGroup
  role: TeamRole | null
  busy: boolean
  run: (work: () => Promise<unknown>, after?: 'team' | 'list') => Promise<void>
}

function AssigneeSelect({ members, value, onChange, label, disabled }: { members: TeamMember[]; value: string | null; onChange: (id: string | null) => void; label: string; disabled?: boolean }) {
  return (
    <select aria-label={label} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} className={`${field} w-auto`}>
      <option value="">Niemand</option>
      {members
        .filter((m) => m.role !== 'viewer' || m.userId === value)
        .map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.displayName}
          </option>
        ))}
    </select>
  )
}

function Projects({ api, comments, team, data, me, role, busy, run }: PartProps & { data: TeamData; me: string; comments: TaskComments | null }) {
  const [talk, setTalk] = useState<string | null>(null)
  const { counts, refresh: refreshCounts } = useCommentCounts(comments, team.id)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState<string | null>(null)
  const [due, setDue] = useState('')
  const edit = teamCan(role, 'edit')
  const project = data.projects.find((p) => p.id === projectId) ?? data.projects[0] ?? null
  const mine = myTeamTasks(data.tasks, me)
  const board = project ? teamBoard(data.tasks, project.id) : null
  const projectOf = (id: string) => data.projects.find((p) => p.id === id)?.name ?? ''

  return (
    <>
      {!edit && role && <p className="text-xs text-nx-muted">Je bent kijker in dit team: je ziet alles, maar verandert niets.</p>}
      {mine.length > 0 && (
        <section className="space-y-1">
          <h3 className="font-medium">Mijn taken</h3>
          <ul className="space-y-1">
            {mine.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block">{t.title}</span>
                  <span className="block text-xs text-nx-muted">
                    {projectOf(t.projectId)} · {TEAM_TASK_STATUS_LABELS[t.status]}
                    {t.dueAt !== null && ` · ${when(t.dueAt)}`}
                  </span>
                </span>
                {t.dueAt !== null && (
                  <button type="button" className={small} disabled={busy} onClick={() => void run(async () => api.takeOver(t, projectOf(t.projectId)))}>
                    In mijn Agenda
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="space-y-2">
        <h3 className="font-medium">Projecten</h3>
        {data.projects.length === 0 && <p className="text-nx-muted">Nog geen gedeelde projecten. Een project is een bord waar het hele team samen aan werkt.</p>}
        <div className="flex flex-wrap gap-2">
          {data.projects.map((p) => {
            const progress = teamProjectProgress(data.tasks, p.id)
            return (
              <button key={p.id} type="button" aria-pressed={project?.id === p.id} onClick={() => setProjectId(p.id)} className={`${small} ${project?.id === p.id ? 'bg-nx-surface-2 font-medium' : ''}`}>
                {p.name} · {progress.done}/{progress.total}
              </button>
            )
          })}
        </div>
        {edit && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                await api.addProject(team.id, projectName)
                setProjectName('')
              })
            }}
          >
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} maxLength={80} placeholder="Nieuw project, bv. Labo netwerken" aria-label="Naam van het project" className={`${field} flex-1`} />
            <button type="submit" className={button} disabled={busy || !projectName.trim()}>
              Project maken
            </button>
          </form>
        )}
      </section>
      {project && board && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 flex-1 font-medium">{project.name}</h3>
            {(teamCan(role, 'manage') || (edit && project.createdBy === me)) && (
              <button type="button" className={small} disabled={busy} aria-label={`Project ${project.name} verwijderen`} onClick={() => void run(() => api.removeProject(project.id))}>
                Project verwijderen
              </button>
            )}
          </div>
          {edit && (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const dueAt = due ? Date.parse(due) : null
                void run(async () => {
                  await api.addTask(project, title, assignee, dueAt !== null && Number.isFinite(dueAt) ? dueAt : null)
                  setTitle('')
                  setDue('')
                })
              }}
            >
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Nieuwe taak" aria-label="Titel van de taak" className={`${field} flex-1`} />
              <AssigneeSelect members={data.members} value={assignee} onChange={setAssignee} label="Voor wie" />
              <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Tegen wanneer" className={`${field} w-auto`} />
              <button type="submit" className={button} disabled={busy || !title.trim()}>
                Taak toevoegen
              </button>
            </form>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            {TEAM_TASK_STATUSES.map((status, column) => (
              <div key={status} className="space-y-2 rounded-lg bg-nx-surface-2 p-2" aria-label={TEAM_TASK_STATUS_LABELS[status]} role="group">
                <p className="text-xs font-medium text-nx-muted">
                  {TEAM_TASK_STATUS_LABELS[status]} ({board[status].length})
                </p>
                {board[status].map((t) => (
                  <div key={t.id} className="space-y-1 rounded-md border border-nx-border bg-nx-surface p-2">
                    <p className={status === 'done' ? 'text-nx-muted line-through' : ''}>{t.title}</p>
                    <p className="text-xs text-nx-muted">
                      {t.dueAt !== null ? when(t.dueAt) : 'Geen datum'} · laatst door {memberName(data.members, t.updatedBy, me)}
                    </p>
                    {edit ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <AssigneeSelect members={data.members} value={t.assignee} label={`${t.title} voor wie`} disabled={busy} onChange={(a) => void run(() => api.updateTask(t.id, { assignee: a }))} />
                        <input
                          type="datetime-local"
                          aria-label={`${t.title} tegen wanneer`}
                          defaultValue={localInput(t.dueAt)}
                          disabled={busy}
                          onBlur={(e) => {
                            const next = e.target.value ? Date.parse(e.target.value) : null
                            if (next !== t.dueAt && (next === null || Number.isFinite(next))) void run(() => api.updateTask(t.id, { dueAt: next }))
                          }}
                          className={`${field} w-auto text-xs`}
                        />
                        {column > 0 && (
                          <button type="button" className={small} disabled={busy} aria-label={`${t.title} naar ${TEAM_TASK_STATUS_LABELS[TEAM_TASK_STATUSES[column - 1]]}`} onClick={() => void run(() => api.updateTask(t.id, { status: TEAM_TASK_STATUSES[column - 1] }))}>
                            ←
                          </button>
                        )}
                        {column < 2 && (
                          <button type="button" className={small} disabled={busy} aria-label={`${t.title} naar ${TEAM_TASK_STATUS_LABELS[TEAM_TASK_STATUSES[column + 1]]}`} onClick={() => void run(() => api.updateTask(t.id, { status: TEAM_TASK_STATUSES[column + 1] }))}>
                            →
                          </button>
                        )}
                        <button type="button" className={small} disabled={busy} aria-label={`Taak ${t.title} verwijderen`} onClick={() => void run(() => api.removeTask(t.id))}>
                          ✕
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-nx-muted">Voor {memberName(data.members, t.assignee, me)}</p>
                    )}
                    {comments && <CommentsButton count={counts.get(t.id) ?? 0} open={talk === t.id} title={t.title} onClick={() => setTalk(talk === t.id ? null : t.id)} />}
                    {comments && talk === t.id && <TaskCommentThread api={comments} groupId={team.id} target={{ kind: 'project', taskId: t.id }} members={data.members} me={me} role={role} onChange={refreshCounts} />}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function Members({ api, team, data, me, role, busy, run }: PartProps & { data: TeamData; me: string }) {
  const [handOver, setHandOver] = useState<string | null>(null)
  return (
    <>
      <ul className="space-y-1">
        {sortMembers(data.members).map((m) => {
          const self = m.userId === me
          const choices = roleChoices(role, m.role, self)
          return (
            <li key={m.userId} className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border px-3 py-2">
              <span className="min-w-0 flex-1">
                {m.displayName}
                {self && ' (jij)'}
              </span>
              {choices.length > 0 ? (
                <select aria-label={`Rol van ${m.displayName}`} value={m.role} disabled={busy} onChange={(e) => void run(() => api.setRole(team.id, m.userId, e.target.value as TeamRole))} className={`${field} w-auto`}>
                  {[m.role, ...choices.filter((c) => c !== m.role)].map((r) => (
                    <option key={r} value={r}>
                      {TEAM_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={pill}>{TEAM_ROLE_LABELS[m.role]}</span>
              )}
              {teamCan(role, 'transfer') && !self && (
                handOver === m.userId ? (
                  <button type="button" className={small} disabled={busy} onClick={() => void run(async () => {
                    await api.transfer(team.id, m.userId)
                    setHandOver(null)
                  })}>
                    Ja, maak {m.displayName} eigenaar
                  </button>
                ) : (
                  <button type="button" className={small} onClick={() => setHandOver(m.userId)}>
                    Eigenaar maken
                  </button>
                )
              )}
              {canRemove(role, m.role, self) && (
                <button type="button" className={small} disabled={busy} aria-label={`${m.displayName} uit het team halen`} onClick={() => void run(() => api.removeMember(team.id, m.userId))}>
                  Uit team halen
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {handOver && <p className="text-xs text-nx-muted">Wie eigenaar wordt, kan het team verwijderen. Jij wordt dan beheerder.</p>}
      <section className="space-y-1">
        <h3 className="font-medium">Wat elke rol mag</h3>
        <ul className="space-y-0.5 text-xs text-nx-muted">
          {TEAM_ROLES.map((r) => (
            <li key={r}>
              <span className="font-medium text-nx-text">{TEAM_ROLE_LABELS[r]}</span>: {TEAM_ROLE_HELP[r]}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function Invites({ api, team, data, role, busy, run }: PartProps & { data: TeamData }) {
  const [inviteRole, setInviteRole] = useState<TeamInvite['role']>('member')
  const [hours, setHours] = useState(168)
  const [uses, setUses] = useState<number | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const now = Date.now()
  const copy = (code: string, asLink = false) =>
    void navigator.clipboard?.writeText(asLink ? joinLink(code) : formatTeamCode(code)).then(() => {
      setCopied(asLink ? `link:${code}` : code)
      setTimeout(() => setCopied(null), 2000)
    })
  const share = (code: string) =>
    void navigator.share?.({ title: `Uitnodiging voor ${team.name}`, text: `Kom bij ${team.name} in NEXUS:`, url: joinLink(code) }).catch(() => {})
  const roles: Array<TeamInvite['role']> = teamCan(role, 'inviteAdmin') ? ['admin', 'member', 'viewer'] : ['member', 'viewer']
  return (
    <>
      <form
        className="space-y-2 rounded-lg border border-nx-border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void run(() => api.invite(team.id, inviteRole, hours, uses))
        }}
      >
        <p className="font-medium">Nieuwe uitnodiging</p>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Rol" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as TeamInvite['role'])} className={`${field} w-auto`}>
            {roles.map((r) => (
              <option key={r} value={r}>
                als {TEAM_ROLE_LABELS[r].toLowerCase()}
              </option>
            ))}
          </select>
          <select aria-label="Geldig" value={hours} onChange={(e) => setHours(Number(e.target.value))} className={`${field} w-auto`}>
            {INVITE_DURATIONS.map((d) => (
              <option key={d.hours} value={d.hours}>
                {d.label} geldig
              </option>
            ))}
          </select>
          <select aria-label="Hoe vaak" value={uses ?? ''} onChange={(e) => setUses(e.target.value ? Number(e.target.value) : null)} className={`${field} w-auto`}>
            {USES.map((u) => (
              <option key={u ?? 'all'} value={u ?? ''}>
                {u === null ? 'onbeperkt te gebruiken' : `${u} keer te gebruiken`}
              </option>
            ))}
          </select>
          <button type="submit" className={primaryButton} disabled={busy}>
            Uitnodiging maken
          </button>
        </div>
      </form>
      {data.invites.length === 0 && <p className="text-nx-muted">Nog geen uitnodigingen.</p>}
      <ul className="space-y-1">
        {data.invites.map((i) => (
          <li key={i.id} className={`flex flex-wrap items-center gap-2 rounded-lg border border-nx-border px-3 py-2 ${inviteState(i, now) === 'active' ? '' : 'opacity-60'}`}>
            <span className="font-mono">{formatTeamCode(i.code)}</span>
            <span className={pill}>{TEAM_ROLE_LABELS[i.role]}</span>
            <span className="min-w-0 flex-1 text-xs text-nx-muted">{inviteSummary(i, now)}</span>
            {inviteState(i, now) === 'active' && (
              <>
                <button type="button" className={small} onClick={() => copy(i.code)}>
                  {copied === i.code ? 'Gekopieerd' : 'Code kopiëren'}
                </button>
                <button type="button" className={small} onClick={() => copy(i.code, true)} aria-label={`Link van ${formatTeamCode(i.code)} kopiëren`}>
                  {copied === `link:${i.code}` ? 'Link gekopieerd' : 'Link kopiëren'}
                </button>
                {typeof navigator.share === 'function' && (
                  <button type="button" className={small} onClick={() => share(i.code)}>
                    Delen
                  </button>
                )}
              </>
            )}
            <button type="button" className={small} disabled={busy} aria-label={`Uitnodiging ${formatTeamCode(i.code)} intrekken`} onClick={() => void run(() => api.withdraw(i.id))}>
              Intrekken
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-nx-muted">
        De vaste code van de studiegroep, <span className="font-mono">{formatTeamCode(team.inviteCode)}</span>, blijft werken en maakt nieuwe mensen lid. Wie al in het team zit, houdt zijn rol. Een link opent NEXUS met de code al ingevuld; wie nog niet aangemeld is, meldt zich eerst aan.{' '}
        <button type="button" className="underline" onClick={() => copy(team.inviteCode, true)}>
          {copied === `link:${team.inviteCode}` ? 'Link gekopieerd' : 'Link met de vaste code kopiëren'}
        </button>
      </p>
    </>
  )
}

function Settings({ api, team, role, busy, run, onGone }: PartProps & { onGone: () => void }) {
  const [name, setName] = useState(team.name)
  const [confirm, setConfirm] = useState<'leave' | 'delete' | null>(null)
  useEffect(() => setName(team.name), [team.name])
  return (
    <>
      <ClassAgendaToggle team={team} />
      {teamCan(role, 'manage') && <TeamClass api={api} team={team} busy={busy} run={run} />}
      {teamCan(role, 'manage') && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => api.rename(team.id, name), 'list')
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Naam van het team" className={`${field} flex-1`} />
          <button type="submit" className={button} disabled={busy || !name.trim() || name.trim() === team.name}>
            Hernoemen
          </button>
        </form>
      )}
      {role === 'owner' ? (
        <p className="text-xs text-nx-muted">Als eigenaar kun je het team niet verlaten. Maak eerst iemand anders eigenaar bij Leden, of verwijder het team.</p>
      ) : (
        <div className="flex gap-2">
          {confirm === 'leave' ? (
            <>
              <button type="button" className={danger} disabled={busy} onClick={() => void run(async () => {
                await api.leave(team.id)
                setConfirm(null)
                onGone()
              }, 'list')}>
                Ja, verlaat {team.name}
              </button>
              <button type="button" className={button} onClick={() => setConfirm(null)}>
                Annuleren
              </button>
            </>
          ) : (
            <button type="button" className={button} onClick={() => setConfirm('leave')}>
              Team verlaten
            </button>
          )}
        </div>
      )}
      {teamCan(role, 'delete') && (
        <div className="space-y-1">
          {confirm === 'delete' ? (
            <div className="flex gap-2">
              <button type="button" className={danger} disabled={busy} onClick={() => void run(async () => {
                await api.remove(team.id)
                setConfirm(null)
                onGone()
              }, 'list')}>
                Ja, verwijder {team.name} voor iedereen
              </button>
              <button type="button" className={button} onClick={() => setConfirm(null)}>
                Annuleren
              </button>
            </div>
          ) : (
            <button type="button" className={button} onClick={() => setConfirm('delete')}>
              Team verwijderen
            </button>
          )}
          <p className="text-xs text-nx-muted">Verwijderen haalt het team weg met alle projecten, taken, groepsdeadlines en wat leden er deelden.</p>
        </div>
      )}
      <p className="text-xs text-nx-muted">Wat leden delen en de groepsdeadlines vind je in Studie › Groep; dit team is daar dezelfde groep.</p>
    </>
  )
}

/** Everyone: whether the group deadlines of this team go to your own Agenda (klasagenda). */
function ClassAgendaToggle({ team }: { team: StudyGroup }) {
  const state = useClassAgenda()
  const on = classAgendaFor(state, team)
  const chosen = team.id in state.groups
  return (
    <div className="space-y-1 rounded-lg border border-nx-border px-3 py-2">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={on} onChange={(e) => classAgendaStore.setGroup(team.id, e.target.checked === !!team.klas ? null : e.target.checked)} />
        Groepsdeadlines in mijn Agenda zetten
      </label>
      <p className="text-xs text-nx-muted">
        {team.klas ? `Dit is een klasteam (${team.klas}), dus dit staat standaard aan.` : 'Voor teams zonder klas staat dit standaard uit.'} Ze komen in je Agenda met de gewone herinneringen; vink je er een af, dan staat hij ook hier als klaar. Een deadline die je uit je Agenda verwijdert, komt niet terug.
        {chosen && ' Je keuze geldt op al je toestellen.'}
      </p>
    </div>
  )
}

/** Owner and admins: the class of the team, and whether classmates may find and join it. */
function TeamClass({ api, team, busy, run }: Omit<PartProps, 'role'>) {
  const { state } = useProfiles()
  const [klas, setKlas] = useState(team.klas ?? state.klas)
  const [open, setOpen] = useState(team.classOpen ?? false)
  useEffect(() => {
    setKlas(team.klas ?? state.klas)
    setOpen(team.classOpen ?? false)
  }, [team.klas, team.classOpen, state.klas])
  const valid = !klas.trim() || normalizeKlas(klas) !== null
  return (
    <form
      className="space-y-2 rounded-lg border border-nx-border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void run(() => api.setClass(team.id, klas, open), 'list')
      }}
    >
      <p className="font-medium">Klas</p>
      <div className="flex flex-wrap items-center gap-2">
        <input value={klas} onChange={(e) => setKlas(e.target.value)} maxLength={12} placeholder="bv. 1IT3" aria-label="Klas van het team" className={`${field} w-28 font-mono uppercase`} />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={open && !!klas.trim()} disabled={!klas.trim()} onChange={(e) => setOpen(e.target.checked)} />
          Open voor klasgenoten
        </label>
        <button type="submit" className={button} disabled={busy || !valid}>
          Opslaan
        </button>
      </div>
      {!valid && <p className="text-xs text-red-500">Een klas is 2 tot 8 letters en cijfers, bv. 1IT3.</p>}
      <p className="text-xs text-nx-muted">
        Staat het team open, dan ziet iedereen die in NEXUS dezelfde klas invult de naam van het team en hoeveel leden het heeft, en kan hij met één tik aansluiten als lid. NEXUS kijkt niet na of iemand echt in die klas zit; zet het dicht als het team vol of klaar is.
      </p>
    </form>
  )
}

/** Your class, and the teams open to it that you are not in yet. */
function ClassTeams({ api, displayName, setDisplayName, busy, onJoined }: { api: TeamsApi; displayName: string; setDisplayName: (v: string) => void; busy: boolean; onJoined: (id: string) => void }) {
  const { state } = useProfiles()
  const [draft, setDraft] = useState(state.klas)
  const [found, setFound] = useState<ClassTeam[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const klas = state.klas
  useEffect(() => setDraft(klas), [klas])
  useEffect(() => {
    if (!klas) return
    let live = true
    api
      .classTeams(klas)
      .then((list) => live && (setFound(list), setProblem(null)))
      .catch((err) => live && setProblem(message(err)))
    return () => {
      live = false
    }
  }, [api, klas])
  const saveKlas = () => {
    const k = normalizeKlas(draft)
    if (!k) return setProblem('Een klas is 2 tot 8 letters en cijfers, bv. 1IT3.')
    setProblem(null)
    profilesStore.update((st) => ({ ...st, klas: k }))
  }
  const join = async (t: ClassTeam) => {
    setJoining(true)
    try {
      onJoined((await api.joinClass(t.id, klas, displayName)).id)
    } catch (err) {
      setProblem(message(err))
    } finally {
      setJoining(false)
    }
  }
  return (
    <div className="space-y-2 rounded-lg border border-nx-border p-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          saveKlas()
        }}
      >
        <label className="flex items-center gap-2">
          Jouw klas
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={12} placeholder="bv. 1IT3" aria-label="Jouw klas" className={`${field} w-28 font-mono uppercase`} />
        </label>
        <button type="submit" className={small} disabled={!draft.trim() || normalizeKlas(draft) === klas}>
          Opslaan
        </button>
        <span className="text-xs text-nx-muted">Gaat mee met je profielen naar je andere apparaten.</span>
      </form>
      {problem?.startsWith('setup:') ? <SetupHint problem={problem} /> : problem && <p role="alert" className="text-red-500">{problem}</p>}
      {klas && found && found.length === 0 && <p className="text-nx-muted">Nog geen teams open voor {klas}. Maak er een en zet het bij Instellingen open voor je klas.</p>}
      {klas && found && found.length > 0 && (
        <>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} placeholder="Je naam in het team" aria-label="Je naam in het team" className={field} />
          <ul className="space-y-1">
            {found.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-lg border border-nx-border px-3 py-2">
                <span className="min-w-0 flex-1">{t.name}</span>
                <span className={pill}>{t.members === 1 ? '1 lid' : `${t.members} leden`}</span>
                <button type="button" className={small} disabled={busy || joining || !displayName.trim()} onClick={() => void join(t)} aria-label={`Aansluiten bij ${t.name}`}>
                  Aansluiten
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
