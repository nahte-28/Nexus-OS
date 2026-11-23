import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  addVisit,
  checkoutChance,
  onDouble,
  PROOF_FROM,
  judgeProof,
  photoVisit,
  BOT_LEVELS,
  botName,
  botVisit,
  type BotDart,
  type BotLevel,
  checkoutRoute,
  matchSummary,
  summaryLine,
  currentLeg,
  DARTS_MODES,
  dartsEvents,
  dartsStats,
  legsWon,
  linkedEvents,
  liveMatches,
  newMatch,
  playerAverage,
  remaining,
  toThrow,
  undoVisit,
  type DartsMatch,
  type CricketMatch,
  cricketLegsWon,
  marksPerRound,
  type DartsMode,
  type DartsSettings,
  MAX_LEGS_TO_WIN,
  MAX_PLAYERS,
  MAX_SETS_TO_WIN,
  MAX_START,
  MIN_START,
  bestOf,
  formatLabel,
  isPairs,
  legsInSet,
  matchScore,
  setsWon,
  throwerName,
  validStart,
  CHECKOUT_DARTS,
  CLOCK_TARGETS,
  PRACTICE_LABELS,
  checkoutResult,
  clockHits,
  clockTarget,
  clockThrow,
  newPractice,
  practiceStats,
  stopPractice,
  undoPractice,
  type DartsPractice,
  type PracticeGame,
  BOBS_TARGETS,
  PRACTICE_GAMES,
  PRACTICE_HELP,
  SCORING_VISITS,
  bobsRound,
  bobsScore,
  bobsTarget,
  knownPlayers,
  nicknameOf,
  playerLabel,
  practiceSummary,
  removePlayer,
  savePlayer,
  scoringAverage,
  scoringVisit,
} from '@nexus/core'
import { dartsStore, dartsSyncProblem, useDarts } from '../darts/store'
import { CricketScoreboard, CricketSummary, NewCricket, cricketRunning, saveCricket } from '../darts/Cricket'
import { useProfiles } from '../profiles/store'
import { Online } from '../darts/Online'
import { CheckoutProofs } from '../darts/Proofs'
import { PhotoScoreButton, type PhotoScore } from '../darts/PhotoScore'
import { savePhoto, storeProof } from '../darts/photos'
import { readStorage, writeStorage } from '../state/storage'

const TABS = ['Spelen', 'Online', 'Oefenen', 'Geschiedenis', 'Statistieken', 'Instellingen'] as const
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

/** Starting score, best of legs, sets and double-out; shared by a new match and the defaults. */
function FormatFields({ value, onChange }: { value: Format; onChange: (f: Format) => void }) {
  const [ownOpen, setOwnOpen] = useState(!DARTS_MODES.includes(value.mode))
  const custom = ownOpen || !DARTS_MODES.includes(value.mode)
  const [own, setOwn] = useState(custom ? String(value.mode) : '')
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        Spel
        <select
          className={`${field} w-auto`}
          value={custom ? 'eigen' : String(value.mode)}
          onChange={(e) => {
            if (e.target.value === 'eigen') {
              setOwnOpen(true)
              setOwn(String(value.mode))
              return
            }
            setOwnOpen(false)
            onChange({ ...value, mode: Number(e.target.value) })
          }}
        >
          {DARTS_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value="eigen">Eigen score…</option>
        </select>
      </label>
      {custom && (
        <label className="flex flex-col gap-1">
          Startscore ({MIN_START} tot {MAX_START})
          <input
            type="number"
            min={MIN_START}
            max={MAX_START}
            className={`${field} w-24`}
            value={own}
            onChange={(e) => {
              setOwn(e.target.value)
              const n = Number(e.target.value)
              if (validStart(n)) onChange({ ...value, mode: n })
            }}
          />
        </label>
      )}
      <label className="flex flex-col gap-1">
        Legs
        <select className={`${field} w-auto`} value={value.legsToWin} onChange={(e) => onChange({ ...value, legsToWin: Number(e.target.value) })}>
          {Array.from({ length: MAX_LEGS_TO_WIN }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n === 1 ? '1 leg' : `best of ${bestOf(n)}`}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Sets
        <select className={`${field} w-auto`} value={value.setsToWin} onChange={(e) => onChange({ ...value, setsToWin: Number(e.target.value) })}>
          {Array.from({ length: MAX_SETS_TO_WIN }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n === 1 ? 'geen sets' : `best of ${bestOf(n)}`}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 pb-1.5">
        <input type="checkbox" checked={value.doubleOut} onChange={(e) => onChange({ ...value, doubleOut: e.target.checked })} />
        Double-out
      </label>
    </div>
  )
}

type Format = { mode: DartsMode; legsToWin: number; setsToWin: number; doubleOut: boolean }

function NewMatch() {
  const { settings } = useDarts()
  const [pairs, setPairs] = useState(false)
  const [players, setPlayers] = useState<string[]>([settings.me, ''])
  const [format, setFormat] = useState<Format>({ mode: settings.mode, legsToWin: settings.legsToWin, setsToWin: settings.setsToWin, doubleOut: settings.doubleOut })
  const [bot, setBot] = useState<BotLevel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const size = pairs ? 2 : 1
  const maxSlots = MAX_PLAYERS * size
  const sides = Array.from({ length: Math.ceil(players.length / size) }, (_, i) => players.slice(i * size, i * size + size))
  const slotName = (i: number) => (pairs ? `Koppel ${Math.floor(i / 2) + 1}, speler ${(i % 2) + 1}` : `Speler ${i + 1}`)
  const togglePairs = (on: boolean) => {
    setPairs(on)
    const filled = players.filter((p) => p.trim() !== '')
    const want = on ? 4 : 2
    const list = filled.slice(0, on ? 8 : 4)
    while (list.length < want || (on && list.length % 2 === 1)) list.push('')
    setPlayers(list)
  }
  return (
    <form
      aria-label="Nieuwe wedstrijd"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const humans = players.filter((p) => p.trim() !== '')
        const withBot = bot !== null && !pairs
        if (withBot && humans.length >= MAX_PLAYERS) return setError(`Met de bot erbij kunnen er hoogstens ${MAX_PLAYERS - 1} spelers meedoen.`)
        const m = withBot
          ? newMatch(crypto.randomUUID(), [...humans, botName(bot)], { ...format, bot: { side: humans.length, level: bot } }, Date.now())
          : newMatch(crypto.randomUUID(), pairs ? sides : players, format, Date.now())
        if ('error' in m) return setError(m.error)
        setError(null)
        saveMatch(m)
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-medium">Nieuwe wedstrijd</h3>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={pairs} onChange={(e) => togglePairs(e.target.checked)} />
          Koppels (2 tegen 2)
        </label>
      </div>
      {!pairs && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-nx-border p-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={bot !== null}
              onChange={(e) => {
                setBot(e.target.checked ? 'club' : null)
                // Alone against the bot: the empty second player is not needed.
                if (e.target.checked)
                  setPlayers((list) => {
                    const named = list.filter((p) => p.trim() !== '')
                    return named.length > 0 ? named : ['']
                  })
              }}
            />
            Tegen de bot
          </label>
          {bot !== null && (
            <label className="flex items-center gap-2">
              Niveau
              <select aria-label="Niveau van de bot" className={`${field} w-auto`} value={bot} onChange={(e) => setBot(e.target.value as BotLevel)}>
                {BOT_LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label} (gem. ±{l.average})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <div className="space-y-2">
        {sides.map((side, s) => (
          <div key={s} className={pairs ? 'space-y-1 rounded-lg border border-nx-border p-2' : 'space-y-1'} role={pairs ? 'group' : undefined} aria-label={pairs ? `Koppel ${s + 1}` : undefined}>
            {pairs && <div className="text-xs text-nx-muted">Koppel {s + 1}</div>}
            {side.map((p, k) => {
              const i = s * size + k
              return (
                <div key={i} className="flex gap-2">
                  <input aria-label={slotName(i)} className={field} value={p} maxLength={30} placeholder={pairs ? `Speler ${k + 1}` : slotName(i)} onChange={(e) => setPlayers(players.map((x, j) => (j === i ? e.target.value : x)))} />
                  {!pairs && players.length > 1 && (
                    <button type="button" className={small} aria-label={`${slotName(i)} weghalen`} onClick={() => setPlayers(players.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
            {pairs && sides.length > 2 && (
              <button type="button" className={small} aria-label={`Koppel ${s + 1} weghalen`} onClick={() => setPlayers(players.filter((_, j) => Math.floor(j / 2) !== s))}>
                Koppel weghalen
              </button>
            )}
          </div>
        ))}
        {players.length < maxSlots && (
          <button type="button" className={small} onClick={() => setPlayers([...players, ...Array(size).fill('')])}>
            {pairs ? '+ Koppel' : '+ Speler'}
          </button>
        )}
      </div>
      {settings.roster.length > 0 && (
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Vaste spelers">
          <span className="text-nx-muted">Vaste spelers:</span>
          {settings.roster.map((r) => {
            const taken = players.some((p) => p.trim().toLowerCase() === r.name.toLowerCase())
            const empty = players.findIndex((p) => p.trim() === '')
            return (
              <button
                key={r.name}
                type="button"
                className={small}
                disabled={taken || (empty < 0 && players.length >= maxSlots)}
                onClick={() => setPlayers(empty >= 0 ? players.map((p, j) => (j === empty ? r.name : p)) : [...players, r.name, ...Array(size - 1).fill('')])}
              >
                + {playerLabel(settings, r.name)}
              </button>
            )
          })}
        </div>
      )}
      <FormatFields value={format} onChange={setFormat} />
      {error && <p role="alert">{error}</p>}
      <button type="submit" className={primaryButton}>
        Starten
      </button>
    </form>
  )
}

/** A side as shown: its name, with nicknames of the players in it. */
function sideLabel(settings: DartsSettings, match: DartsMatch, side: number): string {
  return match.members[side].map((p) => playerLabel(settings, p)).join(' & ')
}

function Scoreboard({ match }: { match: DartsMatch }) {
  const { settings } = useDarts()
  const [score, setScore] = useState('')
  const [darts, setDarts] = useState(3)
  const [doubles, setDoubles] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [botDarts, setBotDarts] = useState<BotDart[] | null>(null)
  const [photo, setPhoto] = useState<PhotoScore | null>(null)
  // With a finish on, ask how many darts went at a double, for the checkout percentage.
  const ask = settings.askDoubles && checkoutChance(match)
  // On a double you always throw at it, so 0 darts at a double is not an option.
  const least = onDouble(match) ? 1 : 0
  const atDouble = Math.max(least, doubles)
  const turn = toThrow(match)
  const leg = currentLeg(match)
  const left = turn === null ? 0 : remaining(match, turn)
  const route = turn === null ? null : checkoutRoute(left, match.doubleOut)
  const typed = Number(score)
  const finishing = score !== '' && typed === left
  const botTurn = match.bot !== undefined && turn === match.bot.side && match.winner === null
  // The bot throws by itself, after a short pause so you can follow it.
  useEffect(() => {
    if (!botTurn || !match.bot) return
    const level = match.bot.level
    const timer = setTimeout(() => {
      const v = botVisit(remaining(match, match.bot!.side), match.doubleOut, level)
      const next = addVisit(match, v.score, Date.now(), v.darts, checkoutChance(match) ? v.doubles : undefined, v.bust)
      if ('error' in next) return
      setBotDarts(v.thrown)
      saveMatch(next)
    }, BOT_PAUSE)
    return () => clearTimeout(timer)
  }, [botTurn, match])
  const submit = (value: number) => {
    const out = value === left
    const next = addVisit(match, value, Date.now(), out ? darts : 3, ask ? (out ? Math.max(1, atDouble) : atDouble) : undefined)
    if ('error' in next) return setError(next.error)
    setError(null)
    setScore('')
    setDarts(3)
    setDoubles(0)
    setPhoto(null)
    saveMatch(next)
    // A high finish read from a photo keeps that photo as proof, judged without asking NEXUS AI again.
    if (photo && out && value >= PROOF_FROM && photoVisit(photo.reading).total === value) {
      const leg = match.legs.length - 1
      const proof = { leg, at: Date.now(), verdict: judgeProof(photo.reading, value, darts, match.doubleOut), darts: photo.reading.darts, ...(photo.reading.note ? { note: photo.reading.note } : {}) }
      void savePhoto(match.id, leg, photo.data, proof.at).then(() => storeProof(match.id, proof, value))
    }
  }
  const fromPhoto = (read: PhotoScore) => {
    const visit = photoVisit(read.reading)
    setPhoto(read)
    setScore(String(visit.total))
    if (visit.total === left) setDarts(visit.darts)
  }
  return (
    <section aria-label="Scorebord" className="space-y-3">
      <p className="text-nx-muted">
        {match.mode} · {match.doubleOut ? 'double-out' : 'single-out'} · {formatLabel(match)}
        {isPairs(match) && ' · koppels'} · {match.setsToWin > 1 && `set ${leg.set + 1}, `}leg {match.legs.filter((l) => l.set === leg.set).length}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {match.players.map((p, i) => {
          const last = [...leg.visits].reverse().find((v) => v.player === i)
          return (
            <li key={i} className={`rounded-lg border px-3 py-2 ${turn === i ? 'border-nx-accent bg-nx-surface-2' : 'border-nx-border'}`} aria-current={turn === i ? 'true' : undefined}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">
                  {match.members[i].map((name, k) => (
                    <span key={name}>
                      {k > 0 && ' & '}
                      {name}
                      {nicknameOf(settings, name) && <span className="ml-1 text-xs font-normal italic text-nx-muted">'{nicknameOf(settings, name)}'</span>}
                    </span>
                  ))}
                </span>
                <span className="text-nx-muted">
                  {match.setsToWin > 1 && <>sets {setsWon(match, i)} · </>}legs {match.setsToWin > 1 ? legsInSet(match, i) : legsWon(match, i)}
                </span>
              </div>
              <div className="text-3xl font-semibold tabular-nums">{remaining(match, i)}</div>
              <div className="text-xs text-nx-muted" aria-label={`Gemiddelde van ${p}`}>
                gem. {avg(playerAverage(match, i))}
                {match.legs.length > 1 && <> · deze leg {avg(playerAverage(match, i, leg))}</>}
              </div>
              {match.members[i].length > 1 && (
                <div className="text-xs text-nx-muted">{match.members[i].map((name, k) => `${name} ${avg(playerAverage(match, i, undefined, k))}`).join(' · ')}</div>
              )}
              {last && <div className="text-xs text-nx-muted">vorige beurt: {last.bust ? `${last.score} (bust)` : last.score}</div>}
            </li>
          )
        })}
      </ul>
      {botDarts && match.bot && (
        <p className="text-sm text-nx-muted" aria-label="Pijlen van de bot">
          {match.players[match.bot.side]} gooide {botDarts.map((d) => d.label).join(' · ')}
        </p>
      )}
      {botTurn && (
        <p role="status">
          <b>{throwerName(match)}</b> gooit, nog {left}…
        </p>
      )}
      {turn !== null && !botTurn && (
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
            <b>{throwerName(match)}</b> gooit{isPairs(match) && <> voor {match.players[turn]}</>}, nog {left}.{route && <> Uitgooien: <b>{route.join(' ')}</b></>}
          </p>
          <div className="flex gap-2">
            <input aria-label="Score van deze beurt" inputMode="numeric" className={field} value={score} onChange={(e) => setScore(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Totaal van 3 pijlen" />
            <button type="submit" className={primaryButton} disabled={score === ''}>
              Invoeren
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PhotoScoreButton onRead={fromPhoto} />
            {photo && (
              <span className="text-xs text-nx-muted" aria-label="Gelezen van de foto">
                NEXUS AI zag {photo.reading.darts.join(' · ')} = {photoVisit(photo.reading).total}. Klopt het niet? Pas de score aan.
              </span>
            )}
          </div>
          {finishing && (
            <fieldset className="flex items-center gap-3">
              <legend className="sr-only">Pijlen voor de finish</legend>
              Uitgegooid met
              {[1, 2, 3].map((n) => (
                <label key={n} className="flex items-center gap-1">
                  <input type="radio" name="darts" aria-label={`Uit in ${n}`} checked={darts === n} onChange={() => setDarts(n)} /> {n}
                </label>
              ))}
              {n(darts)}
            </fieldset>
          )}
          {ask && (
            <fieldset className="flex flex-wrap items-center gap-3">
              <legend className="sr-only">Pijlen op een dubbel</legend>
              Pijlen op een dubbel
              {[0, 1, 2, 3].filter((k) => k >= least).map((k) => (
                <label key={k} className="flex items-center gap-1">
                  <input type="radio" name="doubles" aria-label={`${k} op een dubbel`} checked={atDouble === k} onChange={() => setDoubles(k)} /> {k}
                </label>
              ))}
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
          {sideLabel(settings, match, match.winner)} wint met {matchScore(match)}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          disabled={leg.visits.length === 0 && match.legs.length === 1}
          onClick={() => {
            setBotDarts(null)
            saveMatch(undoTurn(match))
          }}
        >
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
              const sides = match.players.length
              // Everyone moves up one place, the bot too.
              const bot = match.bot && { ...match.bot, side: (match.bot.side - 1 + sides) % sides }
              const again = newMatch(crypto.randomUUID(), [...match.members.slice(1), match.members[0]], { ...match, bot }, Date.now())
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

/** How long the bot waits before it throws, in ms. */
export const BOT_PAUSE = 900

/** Undo the last visit; against the bot also its visit after yours, so it is your turn again. */
function undoTurn(match: DartsMatch): DartsMatch {
  let m = undoVisit(match, Date.now())
  const bot = match.bot
  if (bot && toThrow(m) === bot.side) {
    const again = undoVisit(m, Date.now())
    if (again !== m) m = again
  }
  return m
}

const avg = (a: number | null) => (a === null ? '–' : a.toFixed(2))
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

const GAME_KEY = 'nexus.darts.game'
type Game = 'x01' | 'cricket'

/** What is on screen: the newest match while it runs, or for 30 minutes after it was won. */
function onScreen<T extends { id: string; winner: number | null; finishedAt: number | null }>(m: T | undefined, dismissed: string | null): T | null {
  if (!m) return null
  if (m.winner === null && m.finishedAt === null) return m
  return m.winner !== null && dismissed !== m.id && Date.now() - (m.finishedAt ?? 0) < 30 * 60_000 ? m : null
}

/** Cricket matches that were not removed, newest first. */
const liveCricket = (s: { cricket: CricketMatch[] }) => s.cricket.filter((m) => m.deletedAt === null).sort((a, b) => b.startedAt - a.startedAt)

function Play() {
  const state = useDarts()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [game, setGameState] = useState<Game>(() => (readStorage(GAME_KEY) === 'cricket' ? 'cricket' : 'x01'))
  const setGame = (g: Game) => {
    setGameState(g)
    writeStorage(GAME_KEY, g)
  }
  const x01 = onScreen(liveMatches(state)[0], dismissed)
  const cricket = onScreen(liveCricket(state)[0], dismissed)
  // When both kinds are on screen, the newest one wins.
  const show = x01 && cricket ? (x01.startedAt >= cricket.startedAt ? x01 : null) : x01
  const showCricket = show ? null : cricket
  const again = (
    <button type="button" className={small} onClick={() => setDismissed((show ?? showCricket)?.id ?? null)}>
      Nieuwe wedstrijd instellen
    </button>
  )
  return (
    <div className="space-y-4">
      <Upcoming />
      {show ? (
        <>
          <Scoreboard match={show} />
          {running(show) ? <CheckoutProofs match={show} /> : <Summary match={show} />}
          {!running(show) && again}
        </>
      ) : showCricket ? (
        <>
          <CricketScoreboard match={showCricket} />
          {!cricketRunning(showCricket) && <CricketSummary match={showCricket} />}
          {!cricketRunning(showCricket) && again}
        </>
      ) : (
        <>
          <div role="radiogroup" aria-label="Spelvorm" className="flex flex-wrap gap-1">
            {(['x01', 'cricket'] as const).map((g) => (
              <button key={g} type="button" role="radio" aria-checked={game === g} className={`${small} ${game === g ? 'bg-nx-surface-2 font-medium' : ''}`} onClick={() => setGame(g)}>
                {g === 'x01' ? '501, 301 …' : 'Cricket'}
              </button>
            ))}
          </div>
          {game === 'x01' ? <NewMatch /> : <NewCricket />}
        </>
      )}
    </div>
  )
}

function History() {
  const state = useDarts()
  const [open, setOpen] = useState<string | null>(null)
  const label = (p: string) => playerLabel(state.settings, p)
  const all = [...liveMatches(state).map((m) => ({ kind: 'x01' as const, m })), ...liveCricket(state).map((m) => ({ kind: 'cricket' as const, m }))].sort((a, b) => b.m.startedAt - a.m.startedAt)
  if (all.length === 0) return <p className="text-nx-muted">Nog geen wedstrijden.</p>
  const toggle = (id: string) => (
    <button type="button" className={`${small} ml-auto`} aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
      Samenvatting
    </button>
  )
  return (
    <ul className="space-y-1">
      {all.map((item) => {
        if (item.kind === 'cricket') {
          const c = item.m
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-2 rounded border border-nx-border px-2 py-1">
              <span className="font-medium">
                {c.players.map(label).join(' – ')}: {c.players.map((_, i) => cricketLegsWon(c, i)).join('–')}
              </span>
              <span className="text-nx-muted">MPR {c.players.map((p, i) => `${p} ${avg(marksPerRound(c, i))}`).join(' · ')}</span>
              <span className="text-nx-muted">
                Cricket · {when(c.startedAt)} · {c.winner !== null ? `${label(c.players[c.winner])} won` : cricketRunning(c) ? 'bezig' : 'gestopt'}
              </span>
              {toggle(c.id)}
              <button type="button" className={small} aria-label={`Wedstrijd van ${when(c.startedAt)} verwijderen`} onClick={() => saveCricket({ ...c, deletedAt: Date.now(), updatedAt: Date.now() })}>
                Verwijderen
              </button>
              {open === c.id && (
                <div className="w-full pt-1">
                  <CricketSummary match={c} />
                </div>
              )}
            </li>
          )
        }
        const m = item.m
        return (
          <li key={m.id} className="flex flex-wrap items-center gap-2 rounded border border-nx-border px-2 py-1">
            <span className="font-medium">
              {m.members.map((side) => side.map(label).join(' & ')).join(' – ')}: {matchScore(m)}
            </span>
            <span className="text-nx-muted">gem. {m.players.map((p, i) => `${p} ${avg(playerAverage(m, i))}`).join(' · ')}</span>
            <span className="text-nx-muted">
              {m.mode} · {formatLabel(m)} · {when(m.startedAt)} · {m.winner !== null ? `${m.members[m.winner].map(label).join(' & ')} won` : running(m) ? 'bezig' : 'gestopt'}
            </span>
            {toggle(m.id)}
            <button type="button" className={small} aria-label={`Wedstrijd van ${when(m.startedAt)} verwijderen`} onClick={() => saveMatch({ ...m, deletedAt: Date.now(), updatedAt: Date.now() })}>
              Verwijderen
            </button>
            {open === m.id && (
              <div className="w-full pt-1">
                <Summary match={m} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

const one = (x: number | null) => (x === null ? '–' : x.toLocaleString('nl-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))

/** The summary of a match: per player the numbers that matter, then every leg. */
function Summary({ match }: { match: DartsMatch }) {
  const { settings } = useDarts()
  const [copied, setCopied] = useState(false)
  const s = matchSummary(match)
  if (s.legsPlayed === 0) return null
  const rows: Array<[string, (x: (typeof s.sides)[number]) => string | number]> = [
    ...(match.setsToWin > 1 ? ([['Sets', (x) => x.setsWon]] as Array<[string, (x: (typeof s.sides)[number]) => string | number]>) : []),
    ['Legs', (x) => x.legsWon],
    ['Gemiddelde', (x) => one(x.average)],
    ['First 9', (x) => one(x.first9)],
    ['Checkout %', (x) => (x.checkoutPct === null ? (x.checkouts > 0 ? `${x.checkouts} uit` : '–') : `${one(x.checkoutPct)}% (${x.checkouts}/${x.doubleDarts})`)],
    ['Hoogste finish', (x) => x.highestFinish || '–'],
    ['Hoogste beurt', (x) => x.highestScore || '–'],
    ['Beste leg', (x) => (x.bestLeg === null ? '–' : `${x.bestLeg} pijlen`)],
    ['Slechtste leg', (x) => (x.worstLeg === null ? '–' : `${x.worstLeg} pijlen`)],
    ['180', (x) => x.oneEighties],
    ['140+', (x) => x.tonForty],
    ['100+', (x) => x.tons],
    ['60+', (x) => x.sixtyPlus],
    ['Pijlen gegooid', (x) => x.dartsThrown],
  ]
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summaryLine(match, s))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <section aria-label="Samenvatting van de wedstrijd" className="space-y-3 rounded-lg border border-nx-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">Samenvatting</h3>
        <span className="text-nx-muted">
          {match.mode} · {formatLabel(match)} · {s.legsPlayed} {s.legsPlayed === 1 ? 'leg' : 'legs'}
          {s.minutes !== null && ` · ${s.minutes} min`}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left tabular-nums">
          <thead>
            <tr>
              <th className="py-1 pr-3 font-normal text-nx-muted" scope="col">
                <span className="sr-only">Cijfer</span>
              </th>
              {s.sides.map((x) => (
                <th key={x.side} scope="col" className={`py-1 pr-3 ${match.winner === x.side ? 'text-nx-accent' : ''}`}>
                  {sideLabel(settings, match, x.side)}
                  {match.winner === x.side && <span className="ml-1 text-xs font-normal">wint</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-t border-nx-border">
                <th scope="row" className="py-1 pr-3 font-normal text-nx-muted">
                  {label}
                </th>
                {s.sides.map((x) => (
                  <td key={x.side} className={`py-1 pr-3 ${label === 'Gemiddelde' && s.bestAverage === x.side ? 'font-semibold' : ''}`}>
                    {value(x)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary className="cursor-pointer text-nx-muted">Per leg</summary>
        <ol className="mt-2 space-y-1">
          {s.legs.map((l) => (
            <li key={l.number}>
              {match.setsToWin > 1 && `Set ${l.set}, `}Leg {l.number}:{' '}
              {l.winner !== null ? (
                <>
                  <b>{sideLabel(settings, match, l.winner)}</b> in {l.darts} pijlen, uit met {l.finish}
                </>
              ) : (
                'niet uitgespeeld'
              )}
              <span className="text-nx-muted"> · gem. {l.averages.map(one).join(' – ')}</span>
            </li>
          ))}
        </ol>
      </details>
      {!settings.askDoubles && <p className="text-xs text-nx-muted">Checkout % staat uit: zet "Pijlen op een dubbel vragen" aan bij Instellingen.</p>}
      <button type="button" className={small} onClick={copy}>
        {copied ? 'Gekopieerd' : 'Uitslag kopiëren'}
      </button>
      <CheckoutProofs match={match} />
    </section>
  )
}

function Stats() {
  const state = useDarts()
  const players = knownPlayers(state)
  const [picked, setPicked] = useState(state.settings.me)
  const who = players.find((p) => p.toLowerCase() === picked.toLowerCase()) ?? state.settings.me
  const s = dartsStats(state.matches, who)
  const rows: Array<[string, string | number]> = [
    ['Gemiddelde (3 pijlen)', s.average.toFixed(2)],
    ['First 9', s.first9.toFixed(2)],
    ["180's", s.oneEighties],
    ['140+', s.tonForty],
    ['100+', s.tons],
    ['Hoogste finish', s.highestCheckout || '–'],
    ['Checkout %', s.checkoutPct === null ? '–' : `${s.checkoutPct}%`],
    ['Beste leg', s.bestLeg ? `${s.bestLeg} pijlen` : '–'],
    ['Legs gewonnen', `${s.legsWon} van ${s.legs}`],
    ['Wedstrijden gewonnen', `${s.matchesWon} van ${s.matches}`],
  ]
  const mine = liveCricket(state).flatMap((c) => {
    const i = c.players.findIndex((x) => x.trim().toLowerCase() === who.trim().toLowerCase())
    return i < 0 ? [] : [{ c, i }]
  })
  const visits = mine.flatMap(({ c, i }) => c.legs.flatMap((l) => l.visits.filter((v) => v.player === i)))
  const marks = visits.reduce((n, v) => n + v.darts.reduce((k, d) => k + (d.target === 0 ? 0 : d.mult), 0), 0)
  const cricketRows: Array<[string, string | number]> =
    mine.length > 0
      ? [
          ['Wedstrijden gewonnen', `${mine.filter(({ c, i }) => c.winner === i).length} van ${mine.length}`],
          ['MPR (treffers per beurt)', visits.length > 0 ? (marks / visits.length).toFixed(2) : '–'],
        ]
      : []
  const p = practiceStats(state.practice)
  const practiceRows: Array<[string, string | number]> = [
    ...(p.clockRounds > 0
      ? ([
          ['Around the Clock: rondes', p.clockRounds],
          ['Beste ronde', `${p.clockBest} pijlen`],
          ['Laatste 5 rondes', `${p.clockRecent} pijlen gemiddeld`],
          ['Raak', `${p.clockHitRate}%`],
        ] as Array<[string, string | number]>)
      : []),
    ...(p.checkoutTries > 0
      ? ([
          ['Checkouts uitgegooid', `${p.checkoutDone} van ${p.checkoutTries} (${p.checkoutRate}%)`],
          ['Hoogste checkout', p.checkoutHighest || '–'],
          ['Pijlen per checkout', p.checkoutDarts ?? '–'],
        ] as Array<[string, string | number]>)
      : []),
    ...(p.doublesRounds > 0 || p.doublesHitRate > 0
      ? ([
          ['Doubles rond: rondes', p.doublesRounds],
          ['Beste doubles-ronde', p.doublesBest ? `${p.doublesBest} pijlen` : '–'],
          ['Doubles raak', `${p.doublesHitRate}%`],
        ] as Array<[string, string | number]>)
      : []),
    ...(p.bobsRounds > 0
      ? ([
          ["Bob's 27: rondes", p.bobsRounds],
          ["Beste Bob's 27", p.bobsBest ?? '–'],
          ["Bob's 27, laatste 5", p.bobsRecent ?? '–'],
        ] as Array<[string, string | number]>)
      : []),
    ...(p.scoringAverage !== null
      ? ([
          ['Scoring: rondes', p.scoringRounds],
          ['Beste scoring-ronde', p.scoringBest !== null ? `${p.scoringBest} per beurt` : '–'],
          ['Scoring gemiddeld', `${p.scoringAverage} per beurt`],
        ] as Array<[string, string | number]>)
      : []),
  ]
  return (
    <div className="space-y-4">
      {players.length > 1 && (
        <label className="flex items-center gap-2">
          Speler
          <select className={`${field} w-auto`} value={who} onChange={(e) => setPicked(e.target.value)}>
            {players.map((p) => (
              <option key={p} value={p}>
                {playerLabel(state.settings, p)}
              </option>
            ))}
          </select>
        </label>
      )}
      {s.matches === 0 ? (
        mine.length === 0 && <p className="text-nx-muted">Nog geen wedstrijden met {who}. Je naam pas je aan bij Instellingen.</p>
      ) : (
        <StatList label={`Statistieken van ${who}`} rows={rows} />
      )}
      {cricketRows.length > 0 && (
        <section className="space-y-1">
          <h3 className="font-medium">Cricket</h3>
          <StatList label={`Cricket-statistieken van ${who}`} rows={cricketRows} />
        </section>
      )}
      {practiceRows.length > 0 && who === state.settings.me && (
        <section className="space-y-1">
          <h3 className="font-medium">Oefenen</h3>
          <StatList label="Statistieken van het oefenen" rows={practiceRows} />
        </section>
      )}
    </div>
  )
}

function StatList({ label, rows }: { label: string; rows: Array<[string, string | number]> }) {
  return (
    <dl aria-label={label} className="grid grid-cols-2 gap-x-4 gap-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-nx-muted">{k}</dt>
          <dd className="font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function savePractice(next: DartsPractice): void {
  dartsStore.update((s) => ({ ...s, practice: [next, ...s.practice.filter((p) => p.id !== next.id)] }))
}

/** Practice: Around the Clock and checkout training, one round at a time. */
function Practice() {
  const state = useDarts()
  const live = state.practice.filter((p) => p.deletedAt === null).sort((a, b) => b.startedAt - a.startedAt)
  const [shown, setShown] = useState<string | null>(null)
  const current = live.find((p) => p.finishedAt === null) ?? live.find((p) => p.id === shown)
  const start = (game: PracticeGame) => {
    const p = newPractice(crypto.randomUUID(), game, Date.now())
    savePractice(p)
    setShown(p.id)
  }
  return (
    <div className="space-y-4">
      {current ? (
        <>
          {current.game === 'clock' || current.game === 'doubles' ? <ClockRound round={current} /> : current.game === 'bobs27' ? <BobsRound round={current} /> : current.game === 'scoring' ? <ScoringRound round={current} /> : <CheckoutRound round={current} />}
          {current.finishedAt !== null && (
            <button type="button" className={small} onClick={() => setShown(null)}>
              Nieuwe oefening
            </button>
          )}
        </>
      ) : (
        <section className="space-y-2">
          <h3 className="font-medium">Kies een oefening</h3>
          <ul className="space-y-2">
            {PRACTICE_GAMES.map((g, i) => (
              <li key={g} className="flex flex-wrap items-center gap-2">
                <button type="button" className={i === 0 ? primaryButton : button} onClick={() => start(g)}>
                  {PRACTICE_LABELS[g]}
                </button>
                <span className="text-sm text-nx-muted">{PRACTICE_HELP[g]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {live.filter((p) => p.finishedAt !== null).length > 0 && (
        <section className="space-y-1">
          <h3 className="font-medium">Vorige oefeningen</h3>
          <ul className="space-y-1">
            {live
              .filter((p) => p.finishedAt !== null)
              .slice(0, 10)
              .map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 rounded border border-nx-border px-2 py-1">
                  <span className="font-medium">{PRACTICE_LABELS[p.game]}</span>
                  <span className="text-nx-muted">
                    {when(p.startedAt)} · {practiceSummary(p)}
                  </span>
                  <button
                    type="button"
                    className={`${small} ml-auto`}
                    aria-label={`Oefening van ${when(p.startedAt)} verwijderen`}
                    onClick={() => savePractice({ ...p, deletedAt: Date.now(), updatedAt: Date.now() })}
                  >
                    Verwijderen
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function ClockRound({ round }: { round: DartsPractice }) {
  const target = clockTarget(round)
  const hits = clockHits(round)
  const now = () => Date.now()
  return (
    <section aria-label={PRACTICE_LABELS[round.game]} className="space-y-3 rounded-lg border border-nx-border p-3">
      <div className="flex items-baseline gap-3">
        <span className="text-sm text-nx-muted">{target ? 'Gooi op' : 'Klaar'}</span>
        <span className="text-4xl font-semibold tabular-nums" aria-live="polite">
          {target ?? `${round.throws.length} pijlen`}
        </span>
      </div>
      <div aria-hidden className="h-2 overflow-hidden rounded-full bg-nx-surface-2">
        <div className="h-full bg-nx-accent" style={{ width: `${(hits / CLOCK_TARGETS) * 100}%` }} />
      </div>
      <p className="text-sm text-nx-muted">
        {hits} van {CLOCK_TARGETS} · {round.throws.length} pijlen gegooid
      </p>
      {round.finishedAt === null ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryButton} onClick={() => savePractice(clockThrow(round, true, now()))}>
            Raak
          </button>
          <button type="button" className={button} onClick={() => savePractice(clockThrow(round, false, now()))}>
            Mis
          </button>
          <button type="button" className={small} disabled={round.throws.length === 0} onClick={() => savePractice(undoPractice(round, now()))}>
            Ongedaan maken
          </button>
          <button type="button" className={`${small} ml-auto`} onClick={() => savePractice(stopPractice(round, now()))}>
            Stoppen
          </button>
        </div>
      ) : (
        target === null && <p>Rond in {round.throws.length} pijlen.</p>
      )}
    </section>
  )
}

function CheckoutRound({ round }: { round: DartsPractice }) {
  const route = checkoutRoute(round.next, true, 3) ?? []
  const done = round.attempts.filter((a) => a.darts !== null).length
  const now = () => Date.now()
  const fewest = Math.max(1, route.length)
  return (
    <section aria-label="Checkout-training" className="space-y-3 rounded-lg border border-nx-border p-3">
      {round.finishedAt === null ? (
        <>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-sm text-nx-muted">Gooi uit</span>
            <span className="text-4xl font-semibold tabular-nums" aria-live="polite">
              {round.next}
            </span>
            <span className="text-sm text-nx-muted">Tip: {route.join(' ')}</span>
          </div>
          <p className="text-sm">Uit in hoeveel pijlen?</p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: CHECKOUT_DARTS - fewest + 1 }, (_, i) => fewest + i).map((n) => (
              <button key={n} type="button" className={button} aria-label={`Uit in ${n} pijlen`} onClick={() => savePractice(checkoutResult(round, n, now()))}>
                {n}
              </button>
            ))}
            <button type="button" className={button} onClick={() => savePractice(checkoutResult(round, null, now()))}>
              Niet gelukt
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={small} disabled={round.attempts.length === 0} onClick={() => savePractice(undoPractice(round, now()))}>
              Ongedaan maken
            </button>
            <button type="button" className={`${small} ml-auto`} onClick={() => savePractice(stopPractice(round, now()))}>
              Klaar
            </button>
          </div>
        </>
      ) : (
        <p className="font-medium">Klaar</p>
      )}
      <p className="text-sm text-nx-muted" aria-live="polite">
        {done} van {round.attempts.length} uitgegooid
        {round.attempts.length > 0 && ` · laatste: ${round.attempts.slice(-5).map((a) => `${a.target}${a.darts ? ` (${a.darts})` : ' ✗'}`).join(', ')}`}
      </p>
    </section>
  )
}

function BobsRound({ round }: { round: DartsPractice }) {
  const target = bobsTarget(round)
  const score = bobsScore(round)
  const now = () => Date.now()
  return (
    <section aria-label="Bob's 27" className="space-y-3 rounded-lg border border-nx-border p-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-sm text-nx-muted">{target ? 'Gooi op' : 'Klaar'}</span>
        <span className="text-4xl font-semibold tabular-nums" aria-live="polite">
          {target ?? `${score} punten`}
        </span>
        {target && <span className="text-sm text-nx-muted">stand: {score}</span>}
      </div>
      <div aria-hidden className="h-2 overflow-hidden rounded-full bg-nx-surface-2">
        <div className="h-full bg-nx-accent" style={{ width: `${(round.hits.length / BOBS_TARGETS) * 100}%` }} />
      </div>
      {target ? (
        <>
          <p className="text-sm">Hoeveel van je drie pijlen zaten in {target}?</p>
          <div className="flex flex-wrap gap-1.5">
            {[0, 1, 2, 3].map((h) => (
              <button key={h} type="button" className={h === 0 ? button : primaryButton} aria-label={`${h} raak`} onClick={() => savePractice(bobsRound(round, h, now()))}>
                {h}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={small} disabled={round.hits.length === 0} onClick={() => savePractice(undoPractice(round, now()))}>
              Ongedaan maken
            </button>
            <button type="button" className={`${small} ml-auto`} onClick={() => savePractice(stopPractice(round, now()))}>
              Stoppen
            </button>
          </div>
        </>
      ) : (
        <p>{score <= 0 ? `Onder nul na ${round.hits.length} doubles.` : `Rond met ${score} punten.`}</p>
      )}
    </section>
  )
}

function ScoringRound({ round }: { round: DartsPractice }) {
  const [score, setScore] = useState('')
  const [error, setError] = useState<string | null>(null)
  const average = scoringAverage(round)
  const submit = (value: number) => {
    const next = scoringVisit(round, value, Date.now())
    if ('error' in next) return setError(next.error)
    setError(null)
    setScore('')
    savePractice(next)
  }
  return (
    <section aria-label="Scoring op T20" className="space-y-3 rounded-lg border border-nx-border p-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-sm text-nx-muted">{round.finishedAt === null ? `Beurt ${round.visits.length + 1} van ${SCORING_VISITS}` : 'Klaar'}</span>
        <span className="text-4xl font-semibold tabular-nums" aria-live="polite">
          {average === null ? '–' : average.toFixed(1)}
        </span>
        <span className="text-sm text-nx-muted">per beurt</span>
      </div>
      {round.finishedAt === null ? (
        <form
          aria-label="Scoring-beurt"
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (score !== '') submit(Number(score))
          }}
        >
          <div className="flex gap-2">
            <input aria-label="Score op T20" inputMode="numeric" className={field} value={score} onChange={(e) => setScore(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Totaal van 3 pijlen" />
            <button type="submit" className={primaryButton} disabled={score === ''}>
              Invoeren
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {QUICK.map((q) => (
              <button key={q} type="button" className={small} onClick={() => submit(q)}>
                {q}
              </button>
            ))}
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={small} disabled={round.visits.length === 0} onClick={() => savePractice(undoPractice(round, Date.now()))}>
              Ongedaan maken
            </button>
            <button type="button" className={`${small} ml-auto`} onClick={() => savePractice(stopPractice(round, Date.now()))}>
              Stoppen
            </button>
          </div>
        </form>
      ) : null}
      {round.visits.length > 0 && <p className="text-sm text-nx-muted">Beurten: {round.visits.join(', ')}</p>}
    </section>
  )
}

function Players() {
  const { settings } = useDarts()
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState<string | null>(null)
  const apply = (next: typeof settings | { error: string }) => {
    if ('error' in next) return setError(next.error)
    setError(null)
    dartsStore.update((s) => ({ ...s, settings: next }))
    return true
  }
  return (
    <section aria-label="Vaste spelers" className="space-y-2">
      <h3 className="font-medium">Vaste spelers</h3>
      <p className="text-sm text-nx-muted">Spelers met wie je vaak gooit. Je kiest ze snel bij een nieuwe wedstrijd, en hun bijnaam staat op het scorebord.</p>
      {settings.roster.length > 0 && (
        <ul className="space-y-1">
          {settings.roster.map((p) => (
            <li key={p.name} className="flex flex-wrap items-center gap-2 rounded border border-nx-border px-2 py-1">
              <span className="font-medium">{p.name}</span>
              <input
                aria-label={`Bijnaam van ${p.name}`}
                className={`${field} w-40`}
                value={p.nickname}
                maxLength={30}
                placeholder="Bijnaam"
                onChange={(e) => apply(savePlayer(settings, p.name, e.target.value, Date.now()))}
              />
              <button type="button" className={`${small} ml-auto`} aria-label={`${p.name} weghalen`} onClick={() => apply(removePlayer(settings, p.name, Date.now()))}>
                Weghalen
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        aria-label="Speler toevoegen"
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (apply(savePlayer(settings, name, nickname, Date.now()))) {
            setName('')
            setNickname('')
          }
        }}
      >
        <input aria-label="Naam" className={`${field} w-40`} value={name} maxLength={30} placeholder="Naam" onChange={(e) => setName(e.target.value)} />
        <input aria-label="Bijnaam" className={`${field} w-40`} value={nickname} maxLength={30} placeholder="Bijnaam (mag leeg)" onChange={(e) => setNickname(e.target.value)} />
        <button type="submit" className={button}>
          Toevoegen
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
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
      <label className="flex flex-col gap-1">
        Jouw bijnaam (mag leeg)
        <input className={field} value={settings.nickname} maxLength={30} placeholder="bv. The Power" onChange={(e) => set({ nickname: e.target.value })} />
      </label>
      <section aria-label="Standaard wedstrijd" className="space-y-1">
        <h3 className="font-medium">Standaard wedstrijd</h3>
        <FormatFields value={{ mode: settings.mode, legsToWin: settings.legsToWin, setsToWin: settings.setsToWin, doubleOut: settings.doubleOut }} onChange={(f) => set(f)} />
      </section>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1 accent-[var(--nx-accent)]" checked={settings.askDoubles} onChange={(e) => set({ askDoubles: e.target.checked })} />
        <span>
          Pijlen op een dubbel vragen
          <span className="block text-nx-muted">Als je kunt uitgooien, vraagt het scorebord hoeveel pijlen op een dubbel gingen. Zo krijg je een checkout-percentage in de samenvatting en je statistieken.</span>
        </span>
      </label>
      <Players />
      <p className="text-sm text-nx-muted">Speel je geen darts? Zet Darts uit bij Instellingen › Apps aan/uit, dan verdwijnt de app overal.</p>
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
      {tab === 'Online' && <Online />}
      {tab === 'Oefenen' && <Practice />}
      {tab === 'Geschiedenis' && <History />}
      {tab === 'Statistieken' && <Stats />}
      {tab === 'Instellingen' && <Settings />}
    </div>
  )
}

