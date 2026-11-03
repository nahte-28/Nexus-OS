import { useCallback, useEffect, useState } from 'react'
import {
  teamCan,
  checkGamePlan,
  GAME_ANSWER_LABELS,
  GAME_ANSWERS,
  GAME_NAME_MAX,
  GAME_PLAN_NOTE_MAX,
  liveGames,
  planAnswers,
  playingNow,
  setShareTeam,
  upcomingPlans,
  type GameAnswer,
  type GamingState,
  type StudyGroup,
  type TeamGamePlan,
  type TeamMember,
} from '@nexus/core'
import { openApp } from '../shell/openApp'
import { supabase } from '../sync/supabase'
import { Teams as TeamsApi } from '../teams/teams'
import { GamingFriends, type FriendsData } from './friends'
import { gamingStore } from './store'

const REFRESH_MS = 60_000
const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const since = (t: number) => new Date(t).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
/** Tonight at 20:00 (or tomorrow when that passed), as a datetime-local value. */
function defaultMoment(now = Date.now()): string {
  const d = new Date(now)
  d.setHours(20, 0, 0, 0)
  if (d.getTime() < now) d.setDate(d.getDate() + 1)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

interface Apis {
  teams: Pick<TeamsApi, 'me' | 'teams' | 'load'>
  friends: Pick<GamingFriends, 'load' | 'addPlan' | 'removePlan' | 'answer' | 'watch'>
}
const defaultApis: Apis | null = supabase ? { teams: new TeamsApi(supabase), friends: new GamingFriends(supabase) } : null

/** Gaming › Vrienden: who in your teams is gaming now, and sessions to play together. */
export function Friends({ state, apis = defaultApis }: { state: GamingState; apis?: Apis | null }) {
  const [me, setMe] = useState<string | null | undefined>(undefined)
  const [teams, setTeams] = useState<StudyGroup[] | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [data, setData] = useState<FriendsData>({ playing: [], plans: [], answers: [] })
  const [problem, setProblem] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!apis) return
    try {
      const user = await apis.teams.me()
      setMe(user?.id ?? null)
      if (!user) return
      const list = await apis.teams.teams()
      setTeams(list)
      const loaded = await Promise.all(list.map((t) => apis.teams.load(t.id, false)))
      setMembers(loaded.flatMap((l) => l.members))
      setData(await apis.friends.load(list.map((t) => t.id)))
      setProblem(null)
    } catch (err) {
      setProblem(message(err))
    }
  }, [apis])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    const stop = apis?.friends.watch(() => void refresh())
    return () => {
      clearInterval(timer)
      stop?.()
    }
  }, [apis, refresh])

  if (!apis) return <p className="text-nx-muted">Gamevrienden heeft een account nodig, en deze NEXUS is niet met de cloud verbonden.</p>
  if (me === null) return <p className="text-nx-muted">Meld je aan in Account om met je teams te gamen.</p>
  if (problem?.startsWith('setup:')) {
    return (
      <p role="alert" className="rounded-md border border-amber-500/40 p-2 text-amber-700 dark:text-amber-300">
        Gamevrienden heeft nog een stap in de database nodig: voer eenmalig <code>{problem.slice(6)}</code> uit in de SQL Editor van Supabase (of via Account › Database-check).
      </p>
    )
  }
  if (me === undefined || teams === null) return problem ? <p role="alert" className="text-red-500">{problem}</p> : <p className="text-nx-muted">Laden…</p>
  if (teams.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-nx-muted">Gamevrienden zijn de mensen uit je teams. Maak een team voor je vrienden of sluit aan met een uitnodigingslink.</p>
        <button type="button" className={primaryButton} onClick={() => openApp('teams')}>
          Teams openen
        </button>
      </div>
    )
  }
  const now = Date.now()
  return (
    <div className="space-y-4">
      {problem && <p role="alert" className="text-red-500">{problem}</p>}
      <p className="text-nx-muted">Je ziet wie uit je teams aan het gamen is, als ze dat delen, en plant samen een sessie. NEXUS leest niets uit een gameplatform: het komt van de Gaming-timer en wat jullie zelf invullen.</p>
      {teams.map((team) => (
        <TeamCard
          key={team.id}
          team={team}
          me={me}
          role={members.find((m) => m.groupId === team.id && m.userId === me)?.role ?? 'viewer'}
          members={members.filter((m) => m.groupId === team.id)}
          data={data}
          state={state}
          now={now}
          apis={apis}
          onChanged={() => void refresh()}
          onProblem={setProblem}
        />
      ))}
    </div>
  )
}

function TeamCard({ team, me, role, members, data, state, now, apis, onChanged, onProblem }: {
  team: StudyGroup
  me: string
  role: TeamMember['role']
  members: TeamMember[]
  data: FriendsData
  state: GamingState
  now: number
  apis: Apis
  onChanged: () => void
  onProblem: (p: string | null) => void
}) {
  const shared = state.settings.shareTeams.includes(team.id)
  const playing = playingNow(data.playing.filter((p) => p.groupId === team.id), members, me, now)
  const plans = upcomingPlans(data.plans.filter((p) => p.groupId === team.id), now)
  const run = async (work: () => Promise<void>) => {
    try {
      await work()
      onProblem(null)
      onChanged()
    } catch (err) {
      onProblem(message(err))
    }
  }
  return (
    <section aria-label={team.name} className="space-y-3 rounded-xl border border-nx-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{team.name}</h3>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={shared} onChange={(e) => gamingStore.update((s) => setShareTeam(s, team.id, e.target.checked, Date.now()))} />
          Laat dit team zien wanneer ik game
        </label>
      </div>
      <div>
        <h4 className="text-xs font-medium uppercase text-nx-muted">Speelt nu</h4>
        {playing.length === 0 ? (
          <p className="text-nx-muted">Niemand die het deelt.</p>
        ) : (
          <ul className="space-y-1">
            {playing.map((p) => (
              <li key={p.userId}>
                <span className="font-medium">{p.name}</span> speelt {p.game} {p.stale ? '(al lang, misschien vergeten te stoppen)' : `sinds ${since(p.startedAt)}`}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-2">
        <h4 className="text-xs font-medium uppercase text-nx-muted">Samen spelen</h4>
        {plans.length === 0 && <p className="text-nx-muted">Nog niets gepland.</p>}
        {plans.map((plan) => (
          <PlanRow key={plan.id} plan={plan} me={me} members={members} data={data} mayRemove={plan.createdBy === me || teamCan(role, 'manage')} onAnswer={(a) => run(() => apis.friends.answer(plan, a, me))} onRemove={() => run(() => apis.friends.removePlan(plan.id))} />
        ))}
        {teamCan(role, 'edit') ? <PlanForm state={state} onPlan={(game, at, note) => run(() => apis.friends.addPlan(team.id, game, at, note))} /> : <p className="text-xs text-nx-muted">Als kijker kun je antwoorden, maar geen sessie plannen.</p>}
      </div>
    </section>
  )
}

function PlanRow({ plan, me, members, data, mayRemove, onAnswer, onRemove }: {
  plan: TeamGamePlan
  me: string
  members: TeamMember[]
  data: FriendsData
  mayRemove: boolean
  onAnswer: (a: GameAnswer | null) => void
  onRemove: () => void
}) {
  const { names, mine } = planAnswers(plan.id, data.answers, members, me)
  const maker = members.find((m) => m.userId === plan.createdBy)?.displayName
  return (
    <div className="space-y-1 rounded-lg bg-nx-surface-2 p-2">
      <p>
        <span className="font-medium">{plan.game}</span> · {when(plan.startsAt)}
        {maker && <span className="text-nx-muted"> · gepland door {maker}</span>}
      </p>
      {plan.note && <p className="text-nx-muted">{plan.note}</p>}
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`Antwoord op ${plan.game}`}>
        {GAME_ANSWERS.map((a) => (
          <button key={a} type="button" aria-pressed={mine === a} className={`${small} ${mine === a ? 'bg-nx-accent text-nx-accent-text' : ''}`} onClick={() => onAnswer(mine === a ? null : a)}>
            {GAME_ANSWER_LABELS[a]}
            {names[a].length > 0 ? ` (${names[a].length})` : ''}
          </button>
        ))}
        {mayRemove && (
          <button type="button" className={small} onClick={onRemove}>
            Verwijderen
          </button>
        )}
      </div>
      {(names.yes.length > 0 || names.maybe.length > 0) && (
        <p className="text-xs text-nx-muted">
          {names.yes.length > 0 && `Doen mee: ${names.yes.join(', ')}. `}
          {names.maybe.length > 0 && `Misschien: ${names.maybe.join(', ')}.`}
        </p>
      )}
    </div>
  )
}

function PlanForm({ state, onPlan }: { state: GamingState; onPlan: (game: string, at: number, note: string) => void }) {
  const games = liveGames(state)
  const [game, setGame] = useState(() => games.find((g) => g.status === 'playing')?.name ?? games[0]?.name ?? '')
  const [moment, setMoment] = useState(() => defaultMoment())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault()
        const at = new Date(moment).getTime()
        const problem = checkGamePlan(game, at, Date.now())
        setError(problem)
        if (problem) return
        onPlan(game, at, note)
        setNote('')
      }}
    >
      <input aria-label="Game om samen te spelen" list="nexus-friend-games" maxLength={GAME_NAME_MAX} placeholder="Game" value={game} onChange={(e) => setGame(e.target.value)} className={field} />
      <datalist id="nexus-friend-games">
        {games.map((g) => (
          <option key={g.id} value={g.name} />
        ))}
      </datalist>
      <input type="datetime-local" aria-label="Wanneer" value={moment} onChange={(e) => setMoment(e.target.value)} className={`${field} sm:w-auto`} />
      <input aria-label="Notitie bij de sessie" maxLength={GAME_PLAN_NOTE_MAX} placeholder="Notitie (optioneel), bv. ranked of Discord" value={note} onChange={(e) => setNote(e.target.value)} className={field} />
      <button type="submit" className={primaryButton}>
        Sessie plannen
      </button>
      {error && <p role="alert" className="text-red-500 sm:col-span-2">{error}</p>}
    </form>
  )
}
