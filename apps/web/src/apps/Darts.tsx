import { useState, useSyncExternalStore } from 'react'
import {
  addVisit,
  checkoutRoute,
  currentLeg,
  DARTS_MODES,
  dartsEvents,
  dartsStats,
  legsWon,
  linkedEvents,
  liveMatches,
  newMatch,
  remaining,
  toThrow,
  undoVisit,
  type DartsMatch,
  type DartsMode,
} from '@nexus/core'
import { dartsStore, dartsSyncProblem, useDarts } from '../darts/store'
import { useProfiles } from '../profiles/store'
import { readStorage, writeStorage } from '../state/storage'

const TABS = ['Spelen', 'Geschiedenis', 'Statistieken', 'Instellingen'] as const
type Tab = (typeof TABS)[number]
const TAB_KEY = 'nexus.darts.tab'
const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const QUICK = [0, 26, 41, 45, 60, 81, 85, 100, 140, 180]

const running = (m: DartsMatch) => m.winner === null && m.finishedAt === null

function saveMatch(next: DartsMatch): void {
  dartsStore.update((s) => ({ ...s, matches: [next, ...s.matches.filter((m) => m.id !== next.id)] }))
}

function NewMatch() {
  const { settings } = useDarts()
  const [players, setPlayers] = useState<string[]>([settings.me, ''])
  const [mode, setMode] = useState<DartsMode>(settings.mode)
  const [legs, setLegs] = useState(settings.legsToWin)
  const [doubleOut, setDoubleOut] = useState(settings.doubleOut)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      aria-label="Nieuwe wedstrijd"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const m = newMatch(crypto.randomUUID(), players, { mode, legsToWin: legs, doubleOut }, Date.now())
        if ('error' in m) return setError(m.error)
        setError(null)
        saveMatch(m)
      }}
    >
      <h3 className="font-medium">Nieuwe wedstrijd</h3>
      <div className="space-y-1">
        {players.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input aria-label={`Speler ${i + 1}`} className={field} value={p} maxLength={30} placeholder={`Speler ${i + 1}`} onChange={(e) => setPlayers(players.map((x, j) => (j === i ? e.target.value : x)))} />
            {players.length > 1 && (
              <button type="button" className={small} aria-label={`Speler ${i + 1} weghalen`} onClick={() => setPlayers(players.filter((_, j) => j !== i))}>
                ✕
              </button>
            )}
          </div>
        ))}
        {players.length < 4 && (
          <button type="button" className={small} onClick={() => setPlayers([...players, ''])}>
            + Speler
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          Spel
          <select className={`${field} w-auto`} value={mode} onChange={(e) => setMode(Number(e.target.value) as DartsMode)}>
            {DARTS_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Legs om te winnen
          <input type="number" min={1} max={11} className={`${field} w-20`} value={legs} onChange={(e) => setLegs(Number(e.target.value) || 1)} />
        </label>
        <label className="flex items-center gap-2 pb-1.5">
          <input type="checkbox" checked={doubleOut} onChange={(e) => setDoubleOut(e.target.checked)} />
          Double-out
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <button type="submit" className={primaryButton}>
        Starten
      </button>
    </form>
  )
}

function Scoreboard({ match }: { match: DartsMatch }) {
  const [score, setScore] = useState('')
  const [darts, setDarts] = useState(3)
  const [error, setError] = useState<string | null>(null)
  const turn = toThrow(match)
  const leg = currentLeg(match)
  const left = turn === null ? 0 : remaining(match, turn)
  const route = turn === null ? null : checkoutRoute(left, match.doubleOut)
  const typed = Number(score)
  const finishing = score !== '' && typed === left
  const submit = (value: number) => {
    const next = addVisit(match, value, Date.now(), value === left ? darts : 3)
    if ('error' in next) return setError(next.error)
    setError(null)
    setScore('')
    setDarts(3)
    saveMatch(next)
  }
  return (
    <section aria-label="Scorebord" className="space-y-3">
      <p className="text-nx-muted">
        {match.mode} · {match.doubleOut ? 'double-out' : 'single-out'} · eerst tot {match.legsToWin} {match.legsToWin === 1 ? 'leg' : 'legs'} · leg {match.legs.length}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {match.players.map((p, i) => {
          const last = [...leg.visits].reverse().find((v) => v.player === i)
          return (
            <li key={i} className={`rounded-lg border px-3 py-2 ${turn === i ? 'border-nx-accent bg-nx-surface-2' : 'border-nx-border'}`} aria-current={turn === i ? 'true' : undefined}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{p}</span>
                <span className="text-nx-muted">legs {legsWon(match, i)}</span>
              </div>
              <div className="text-3xl font-semibold tabular-nums">{remaining(match, i)}</div>
              {last && <div className="text-xs text-nx-muted">vorige beurt: {last.bust ? `${last.score} (bust)` : last.score}</div>}
            </li>
          )
        })}
      </ul>
      {turn !== null && (
        <form
          aria-label="Beurt"
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (score === '') return
            submit(typed)
          }}
        >
          <p>
            <b>{match.players[turn]}</b> gooit, nog {left}.{route && <> Uitgooien: <b>{route.join(' ')}</b></>}
          </p>
          <div className="flex gap-2">
            <input aria-label="Score van deze beurt" inputMode="numeric" className={field} value={score} onChange={(e) => setScore(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Totaal van 3 pijlen" />
            <button type="submit" className={primaryButton} disabled={score === ''}>
              Invoeren
            </button>
          </div>
          {finishing && (
            <fieldset className="flex items-center gap-3">
              <legend className="sr-only">Pijlen voor de finish</legend>
              Uitgegooid met
              {[1, 2, 3].map((n) => (
                <label key={n} className="flex items-center gap-1">
                  <input type="radio" name="darts" checked={darts === n} onChange={() => setDarts(n)} /> {n}
                </label>
              ))}
              {n(darts)}
            </fieldset>
          )}
          <div className="flex flex-wrap gap-1">
            {QUICK.map((q) => (
              <button key={q} type="button" className={small} onClick={() => submit(q)}>
                {q}
              </button>
            ))}
          </div>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
      {match.winner !== null && (
        <p role="status" className="font-medium">
          {match.players[match.winner]} wint met {legsWon(match, match.winner)}–{Math.max(...match.players.map((_, i) => (i === match.winner ? 0 : legsWon(match, i))))}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={leg.visits.length === 0 && match.legs.length === 1} onClick={() => saveMatch(undoVisit(match, Date.now()))}>
          Ongedaan maken
        </button>
        {match.winner === null ? (
          <button type="button" className={button} onClick={() => saveMatch({ ...match, finishedAt: Date.now(), updatedAt: Date.now() })}>
            Wedstrijd stoppen
          </button>
        ) : (
          <button
            type="button"
            className={primaryButton}
            onClick={() => {
              const again = newMatch(crypto.randomUUID(), [...match.players.slice(1), match.players[0]], match, Date.now())
              if (!('error' in again)) saveMatch(again)
            }}
          >
            Nog een wedstrijd
          </button>
        )}
      </div>
    </section>
  )
}

const n = (darts: number) => <span className="text-nx-muted">{darts === 1 ? 'pijl' : 'pijlen'}</span>

function Upcoming() {
  const { state } = useProfiles()
  const events = dartsEvents(linkedEvents(state), Date.now() - 2 * 60 * 60_000)
  if (events.length === 0) return null
  return (
    <section aria-label="Volgende dartsafspraken" className="rounded-lg border border-nx-border px-3 py-2">
      <h3 className="font-medium">Volgende dartsafspraken</h3>
      <ul>
        {events.map((e) => (
          <li key={`${e.start}-${e.subject}`}>
            {when(e.start)}: {e.subject}
            {e.room ? <span className="text-nx-muted"> · {e.room}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Play() {
  const state = useDarts()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const latest = liveMatches(state)[0]
  // A match that just ended stays on screen for its result, until you set up the next one.
  const show = latest && (running(latest) || (latest.winner !== null && dismissed !== latest.id && Date.now() - (latest.finishedAt ?? 0) < 30 * 60_000)) ? latest : null
  return (
    <div className="space-y-4">
      <Upcoming />
      {show ? (
        <>
          <Scoreboard match={show} />
          {!running(show) && (
            <button type="button" className={small} onClick={() => setDismissed(show.id)}>
              Nieuwe wedstrijd instellen
            </button>
          )}
        </>
      ) : (
        <NewMatch />
      )}
    </div>
  )
}

function History() {
  const state = useDarts()
  const matches = liveMatches(state)
  if (matches.length === 0) return <p className="text-nx-muted">Nog geen wedstrijden.</p>
  return (
    <ul className="space-y-1">
      {matches.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center gap-2 rounded border border-nx-border px-2 py-1">
          <span className="font-medium">{m.players.map((p, i) => `${p} ${legsWon(m, i)}`).join(' – ')}</span>
          <span className="text-nx-muted">
            {m.mode} · {when(m.startedAt)} · {m.winner !== null ? `${m.players[m.winner]} won` : running(m) ? 'bezig' : 'gestopt'}
          </span>
          <button
            type="button"
            className={`${small} ml-auto`}
            aria-label={`Wedstrijd van ${when(m.startedAt)} verwijderen`}
            onClick={() => saveMatch({ ...m, deletedAt: Date.now(), updatedAt: Date.now() })}
          >
            Verwijderen
          </button>
        </li>
      ))}
    </ul>
  )
}

function Stats() {
  const state = useDarts()
  const s = dartsStats(state.matches, state.settings.me)
  if (s.matches === 0) return <p className="text-nx-muted">Nog geen wedstrijden met {state.settings.me}. Je naam pas je aan bij Instellingen.</p>
  const rows: Array<[string, string | number]> = [
    ['Gemiddelde (3 pijlen)', s.average.toFixed(2)],
    ['First 9', s.first9.toFixed(2)],
    ["180's", s.oneEighties],
    ['140+', s.tonForty],
    ['100+', s.tons],
    ['Hoogste finish', s.highestCheckout || '–'],
    ['Beste leg', s.bestLeg ? `${s.bestLeg} pijlen` : '–'],
    ['Legs gewonnen', `${s.legsWon} van ${s.legs}`],
    ['Wedstrijden gewonnen', `${s.matchesWon} van ${s.matches}`],
  ]
  return (
    <dl aria-label={`Statistieken van ${state.settings.me}`} className="grid grid-cols-2 gap-x-4 gap-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-nx-muted">{k}</dt>
          <dd className="font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Settings() {
  const { settings } = useDarts()
  const set = (patch: Partial<typeof settings>) => dartsStore.update((s) => ({ ...s, settings: { ...s.settings, ...patch, updatedAt: Date.now() } }))
  return (
    <div className="space-y-3">
      <label className="flex flex-col gap-1">
        Jouw naam in wedstrijden (voor je statistieken)
        <input className={field} value={settings.me} maxLength={30} onChange={(e) => set({ me: e.target.value })} />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          Standaard spel
          <select className={`${field} w-auto`} value={settings.mode} onChange={(e) => set({ mode: Number(e.target.value) as DartsMode })}>
            {DARTS_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Legs om te winnen
          <input type="number" min={1} max={11} className={`${field} w-20`} value={settings.legsToWin} onChange={(e) => set({ legsToWin: Number(e.target.value) || 1 })} />
        </label>
        <label className="flex items-center gap-2 pb-1.5">
          <input type="checkbox" checked={settings.doubleOut} onChange={(e) => set({ doubleOut: e.target.checked })} />
          Double-out
        </label>
      </div>
    </div>
  )
}

export function Darts() {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = readStorage(TAB_KEY)
    return TABS.includes(saved as Tab) ? (saved as Tab) : 'Spelen'
  })
  const problem = useSyncExternalStore(dartsSyncProblem.subscribe, dartsSyncProblem.getSnapshot)
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4 text-sm">
      <div role="tablist" aria-label="Darts" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            className={`${small} ${tab === t ? 'bg-nx-surface-2 font-medium' : ''}`}
            onClick={() => {
              setTab(t)
              writeStorage(TAB_KEY, t)
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {problem && <p role="alert">{problem}</p>}
      {tab === 'Spelen' && <Play />}
      {tab === 'Geschiedenis' && <History />}
      {tab === 'Statistieken' && <Stats />}
      {tab === 'Instellingen' && <Settings />}
    </div>
  )
}

