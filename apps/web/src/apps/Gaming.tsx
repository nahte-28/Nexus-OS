import { useState, useSyncExternalStore } from 'react'
import {
  GAME_STATUS_LABELS,
  GAME_STATUSES,
  gameTotals,
  gamingWeek,
  liveBuilds,
  liveGames,
  liveSessions,
  logGameSession,
  removeBuild,
  removeGame,
  removeGameSession,
  saveBuild,
  saveGame,
  setWeeklyLimit,
  weeklyMinutes,
  type Game,
  type GameStatus,
  type GamingState,
} from '@nexus/core'
import { gamingStore, gamingSyncProblem, useGaming } from '../gaming/store'
import { readStorage, writeStorage } from '../state/storage'

const TABS = ['Bibliotheek', 'Sessies', 'Builds', 'Statistieken', 'Instellingen'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY = 'nexus.gaming.tab'
const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const hours = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} u${m % 60 ? ` ${m % 60} min` : ''}`)

function change(apply: (s: GamingState) => GamingState | { error: string }): string | null {
  const next = apply(gamingStore.getSnapshot())
  if ('error' in next) return next.error
  gamingStore.update(() => next)
  return null
}

function GamePicker({ games, value, onChange }: { games: Game[]; value: string; onChange: (id: string) => void }) {
  return (
    <select aria-label="Game" value={value} onChange={(e) => onChange(e.target.value)} className={`${field} w-auto`}>
      {games.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  )
}

/** Gaming Companion: games, a session log, builds and stats, all entered by you. */
export function Gaming() {
  const state = useGaming()
  const problem = useSyncExternalStore(gamingSyncProblem.subscribe, gamingSyncProblem.getSnapshot)
  const [tab, setTabState] = useState<Tab>(() => (TABS.includes(readStorage(TAB_KEY) as Tab) ? (readStorage(TAB_KEY) as Tab) : 'Bibliotheek'))
  const setTab = (t: Tab) => {
    setTabState(t)
    writeStorage(TAB_KEY, t)
  }
  const games = liveGames(state)
  const week = gamingWeek(state, Date.now())
  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" aria-label="Gaming Companion" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`shrink-0 rounded-md px-3 py-1 ${tab === t ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {problem?.startsWith('setup:') && (
          <p role="alert" className="rounded-md border border-amber-500/40 p-2 text-amber-700 dark:text-amber-300">
            Syncen lukt nog niet: voer eenmalig <code>{problem.slice(6)}</code> uit in de SQL Editor van Supabase (of via Account › Database-check).
          </p>
        )}
        {(week.over || week.near) && (
          <p role="status" className="rounded-md border border-amber-500/40 p-2 text-amber-700 dark:text-amber-300">
            {week.over ? `Je speelde deze week al ${hours(week.minutes)}, meer dan je plan van ${hours(week.limit ?? 0)}.` : `Je zit op ${hours(week.minutes)} van je ${hours(week.limit ?? 0)} deze week.`}
          </p>
        )}
        {tab === 'Bibliotheek' && <Library state={state} />}
        {tab !== 'Bibliotheek' && tab !== 'Instellingen' && games.length === 0 ? (
          <p className="text-nx-muted">Voeg eerst een game toe in de Bibliotheek.</p>
        ) : (
          <>
            {tab === 'Sessies' && <Sessions state={state} games={games} />}
            {tab === 'Builds' && <Builds state={state} games={games} />}
            {tab === 'Statistieken' && <Stats state={state} />}
          </>
        )}
        {tab === 'Instellingen' && <SettingsTab state={state} />}
      </div>
    </div>
  )
}

function Library({ state }: { state: GamingState }) {
  const [name, setName] = useState('')
  const [platform, setPlatform] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<GameStatus | ''>('')
  const games = liveGames(state).filter((g) => !filter || g.status === filter)
  const add = () => {
    const err = change((s) => saveGame(s, { id: crypto.randomUUID(), name, platform, status: 'playing', rating: null, notes: '' }, Date.now()))
    setError(err)
    if (!err) {
      setName('')
      setPlatform('')
    }
  }
  const update = (g: Game, patch: Partial<Game>) => change((s) => saveGame(s, { ...g, ...patch }, Date.now()))
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input aria-label="Nieuwe game" placeholder="Game" value={name} onChange={(e) => setName(e.target.value)} className={`${field} flex-1`} />
        <input aria-label="Platform" placeholder="Platform (pc, Switch …)" value={platform} onChange={(e) => setPlatform(e.target.value)} className={`${field} w-44`} />
        <button type="submit" className={primaryButton}>
          + Game
        </button>
      </form>
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
      <select aria-label="Toon" value={filter} onChange={(e) => setFilter(e.target.value as GameStatus | '')} className={`${field} w-auto`}>
        <option value="">Alle games</option>
        {GAME_STATUSES.map((st) => (
          <option key={st} value={st}>
            {GAME_STATUS_LABELS[st]}
          </option>
        ))}
      </select>
      {games.length === 0 ? <p className="text-nx-muted">Nog geen games. NEXUS leest geen platformen uit: je houdt je bibliotheek zelf bij.</p> : (
        <ul aria-label="Bibliotheek" className="space-y-2">
          {games.map((g) => (
            <li key={g.id} className="space-y-2 rounded-lg border border-nx-border p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {g.name} {g.platform && <span className="text-xs font-normal text-nx-muted">· {g.platform}</span>}
                </span>
                <button type="button" className={small} aria-label={`${g.name} weghalen`} onClick={() => change((s) => removeGame(s, g.id, Date.now()))}>
                  Weghalen
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <select aria-label={`Status van ${g.name}`} value={g.status} onChange={(e) => update(g, { status: e.target.value as GameStatus })} className={`${field} w-auto py-0.5 text-xs`}>
                  {GAME_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {GAME_STATUS_LABELS[st]}
                    </option>
                  ))}
                </select>
                <select aria-label={`Score van ${g.name}`} value={g.rating ?? ''} onChange={(e) => update(g, { rating: e.target.value ? Number(e.target.value) : null })} className={`${field} w-auto py-0.5 text-xs`}>
                  <option value="">Geen score</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {'★'.repeat(n)}
                    </option>
                  ))}
                </select>
              </div>
              <NotesField game={g} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NotesField({ game }: { game: Game }) {
  const [notes, setNotes] = useState(game.notes)
  return (
    <textarea
      aria-label={`Notities bij ${game.name}`}
      placeholder="Notities: waar je bent, wat je nog wil doen …"
      rows={2}
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      onBlur={() => notes !== game.notes && change((s) => saveGame(s, { ...game, notes }, Date.now()))}
      className={`${field} text-xs`}
    />
  )
}

function Sessions({ state, games }: { state: GamingState; games: Game[] }) {
  const [gameId, setGameId] = useState(games[0].id)
  const [minutes, setMinutes] = useState('60')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const name = (id: string) => state.games.find((g) => g.id === id)?.name ?? 'Weggehaald'
  const sessions = liveSessions(state)
  const add = () => {
    const err = change((s) => logGameSession(s, { id: crypto.randomUUID(), gameId: games.some((g) => g.id === gameId) ? gameId : games[0].id, at: Date.now(), minutes: Number(minutes), note }, Date.now()))
    setError(err)
    if (!err) setNote('')
  }
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <GamePicker games={games} value={gameId} onChange={setGameId} />
        <input type="number" min={1} max={1440} aria-label="Minuten" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={`${field} w-24`} />
        <input aria-label="Notitie bij de sessie" placeholder="Notitie (optioneel)" value={note} onChange={(e) => setNote(e.target.value)} className={`${field} flex-1`} />
        <button type="submit" className={button}>
          Sessie noteren
        </button>
      </form>
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
      {sessions.length === 0 ? <p className="text-nx-muted">Nog geen sessies.</p> : (
        <ul aria-label="Sessies" className="space-y-1">
          {sessions.slice(0, 100).map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-2">
              <span>
                {name(x.gameId)} · {hours(x.minutes)}
                {x.note ? ` · ${x.note}` : ''}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-nx-muted">
                {when(x.at)}
                <button type="button" className={small} aria-label={`Sessie van ${when(x.at)} weghalen`} onClick={() => gamingStore.update((s) => removeGameSession(s, x.id, Date.now()))}>
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Builds({ state, games }: { state: GamingState; games: Game[] }) {
  const [gameId, setGameId] = useState(games[0].id)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [tags, setTags] = useState('')
  const [error, setError] = useState<string | null>(null)
  const game = games.find((g) => g.id === gameId) ?? games[0]
  const builds = liveBuilds(state, game.id)
  const save = () => {
    const err = change((s) => saveBuild(s, { id: crypto.randomUUID(), gameId: game.id, name, text, tags: tags.split(',') }, Date.now()))
    setError(err)
    if (!err) {
      setName('')
      setText('')
      setTags('')
    }
  }
  return (
    <div className="space-y-3">
      <GamePicker games={games} value={game.id} onChange={setGameId} />
      <form
        aria-label="Nieuwe build"
        className="space-y-2 rounded-lg border border-nx-border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input aria-label="Naam van de build" placeholder="Naam, bv. Ranked loadout" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        <textarea aria-label="Build" placeholder="Items, skills, instellingen …" rows={3} value={text} onChange={(e) => setText(e.target.value)} className={`${field} font-mono text-xs`} />
        <input aria-label="Tags" placeholder="Tags, gescheiden door komma's" value={tags} onChange={(e) => setTags(e.target.value)} className={field} />
        <button type="submit" className={primaryButton}>
          Build bewaren
        </button>
        {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
      </form>
      {builds.length === 0 ? <p className="text-nx-muted">Nog geen builds voor {game.name}.</p> : (
        <ul aria-label="Builds" className="space-y-2">
          {builds.map((b) => (
            <li key={b.id} className="space-y-1 rounded-lg border border-nx-border p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{b.name}</span>
                <span className="flex gap-1">
                  <button type="button" className={small} onClick={() => void navigator.clipboard?.writeText(b.text)}>
                    Kopiëren
                  </button>
                  <button type="button" className={small} aria-label={`Build ${b.name} weghalen`} onClick={() => gamingStore.update((s) => removeBuild(s, b.id, Date.now()))}>
                    Weghalen
                  </button>
                </span>
              </div>
              {b.text && <pre className="whitespace-pre-wrap rounded-md bg-nx-surface-2 p-2 font-mono text-xs">{b.text}</pre>}
              {b.tags.length > 0 && <p className="text-xs text-nx-muted">{b.tags.map((t) => `#${t}`).join(' ')}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Stats({ state }: { state: GamingState }) {
  const now = Date.now()
  const weeks = weeklyMinutes(state, now)
  const totals = gameTotals(state)
  const max = Math.max(60, ...weeks.map((w) => w.minutes))
  const limit = state.settings.weeklyLimitMinutes
  return (
    <div className="space-y-4">
      <section aria-label="Per week" className="space-y-2">
        <h3 className="font-medium">Speeltijd per week</h3>
        <svg viewBox={`0 0 ${weeks.length * 40} 110`} className="h-32 w-full" role="img" aria-label={`Speeltijd van de laatste ${weeks.length} weken`}>
          {weeks.map((w, i) => {
            const h = (w.minutes / max) * 90
            return (
              <g key={w.start}>
                <rect x={i * 40 + 8} y={95 - h} width={24} height={h} rx={3} className="fill-current text-nx-accent" />
                <text x={i * 40 + 20} y={108} textAnchor="middle" className="fill-current text-[9px] text-nx-muted">
                  {new Date(w.start).getDate()}/{new Date(w.start).getMonth() + 1}
                </text>
              </g>
            )
          })}
          {limit !== null && limit <= max && <line x1={0} x2={weeks.length * 40} y1={95 - (limit / max) * 90} y2={95 - (limit / max) * 90} strokeDasharray="4 3" className="stroke-current text-amber-500" />}
        </svg>
      </section>
      <section aria-label="Per game" className="space-y-1">
        <h3 className="font-medium">Per game</h3>
        <ul className="space-y-1">
          {totals.map((t) => (
            <li key={t.game.id} className="flex justify-between gap-2">
              <span>{t.game.name}</span>
              <span className="text-xs text-nx-muted">
                {hours(t.minutes)} · {t.sessions} {t.sessions === 1 ? 'sessie' : 'sessies'}
                {t.lastAt ? ` · laatst ${new Date(t.lastAt).toLocaleDateString('nl-BE')}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function SettingsTab({ state }: { state: GamingState }) {
  const [limit, setLimit] = useState(state.settings.weeklyLimitMinutes ? String(state.settings.weeklyLimitMinutes / 60) : '')
  const [status, setStatus] = useState<string | null>(null)
  const save = () => {
    const h = Number(limit.replace(',', '.'))
    gamingStore.update((s) => setWeeklyLimit(s, limit.trim() && h > 0 ? h * 60 : null, Date.now()))
    setStatus(limit.trim() && h > 0 ? `Plan bewaard: ${limit} uur per week.` : 'Geen plan per week.')
  }
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <label className="flex items-center gap-2">
          Uren per week
          <input inputMode="decimal" aria-label="Uren per week" placeholder="geen" value={limit} onChange={(e) => setLimit(e.target.value)} className={`${field} w-24`} />
        </label>
        <button type="submit" className={button}>
          Bewaren
        </button>
        {status && <span role="status" className="text-nx-muted">{status}</span>}
      </form>
      <p className="text-nx-muted">Met een plan waarschuwt Gaming Companion vanaf 80 % en als je erover gaat. Statistieken komen alleen uit sessies die je zelf noteert: NEXUS koppelt geen gameplatform en leest niets uit zonder officiële toegang. Vrienden komen pas met Teams.</p>
    </div>
  )
}
