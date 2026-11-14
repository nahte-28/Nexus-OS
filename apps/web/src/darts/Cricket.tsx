import { useState } from 'react'
import {
  addCricketVisit,
  bestOf,
  CRICKET_TARGETS,
  cricketBoard,
  cricketLabel,
  cricketLeg,
  cricketLegsWon,
  cricketSummary,
  cricketToThrow,
  MAX_LEGS_TO_WIN,
  marksPerRound,
  newCricket,
  playerLabel,
  undoCricket,
  type CricketDart,
  type CricketMatch,
  type CricketTarget,
} from '@nexus/core'
import { dartsStore, useDarts } from './store'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

export const cricketRunning = (m: CricketMatch) => m.winner === null && m.finishedAt === null

export function saveCricket(next: CricketMatch): void {
  dartsStore.update((s) => ({
    ...s,
    cricket: [next, ...s.cricket.filter((m) => m.id !== next.id)],
  }))
}

const targetName = (t: CricketTarget) => (t === 25 ? 'Bull' : String(t))
/** Marks as on a chalk board: one stroke, a cross, a circled cross. */
const markSign = (n: number) => ['', '/', 'X', 'Ⓧ'][Math.min(3, n)]
const markWord = (n: number) => (n >= 3 ? 'dicht' : `${n} ${n === 1 ? 'treffer' : 'treffers'}`)
const two = (x: number | null) =>
  x === null
    ? '–'
    : x.toLocaleString('nl-BE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })

/** A new Cricket match: players and best of legs. */
export function NewCricket() {
  const { settings } = useDarts()
  const [players, setPlayers] = useState<string[]>([settings.me, ''])
  const [legs, setLegs] = useState(settings.legsToWin)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      aria-label="Nieuwe Cricket-wedstrijd"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const m = newCricket(crypto.randomUUID(), players, legs, Date.now())
        if ('error' in m) return setError(m.error)
        setError(null)
        saveCricket(m)
      }}
    >
      <p className="text-nx-muted">
        Gooi 20 tot 15 en de bull dicht met drie treffers per nummer. Treffers op een nummer dat jij dicht hebt en een ander nog niet, tellen als punten. Wie alles dicht heeft en de meeste punten,
        wint.
      </p>
      <div className="space-y-1">
        {players.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input
              aria-label={`Speler ${i + 1}`}
              className={field}
              value={p}
              maxLength={30}
              placeholder={`Speler ${i + 1}`}
              onChange={(e) => setPlayers(players.map((x, j) => (j === i ? e.target.value : x)))}
            />
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
                disabled={taken || (empty < 0 && players.length >= 4)}
                onClick={() => setPlayers(empty >= 0 ? players.map((p, j) => (j === empty ? r.name : p)) : [...players, r.name])}
              >
                + {playerLabel(settings, r.name)}
              </button>
            )
          })}
        </div>
      )}
      <label className="flex flex-col gap-1">
        Legs
        <select className={`${field} w-auto`} value={legs} onChange={(e) => setLegs(Number(e.target.value))}>
          {Array.from({ length: MAX_LEGS_TO_WIN }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n === 1 ? '1 leg' : `best of ${bestOf(n)}`}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" className={primaryButton}>
        Starten
      </button>
    </form>
  )
}

/** The Cricket board: marks and points per player, and three darts to tap in. */
export function CricketScoreboard({ match }: { match: CricketMatch }) {
  const { settings } = useDarts()
  const [mult, setMult] = useState<1 | 2 | 3>(1)
  const [darts, setDarts] = useState<CricketDart[]>([])
  const [error, setError] = useState<string | null>(null)
  const leg = cricketLeg(match)
  const board = cricketBoard(match, leg)
  const turn = cricketToThrow(match)
  const label = (p: string) => playerLabel(settings, p)
  const tap = (target: CricketTarget | 0) => {
    if (darts.length >= 3) return
    const m = target === 25 && mult === 3 ? 2 : mult
    setDarts([...darts, target === 0 ? { target: 0, mult: 1 } : { target, mult: m }])
    setMult(1)
  }
  const submit = () => {
    const next = addCricketVisit(match, darts, Date.now())
    if ('error' in next) return setError(next.error)
    setError(null)
    setDarts([])
    setMult(1)
    saveCricket(next)
  }
  return (
    <section aria-label="Cricket-scorebord" className="space-y-3">
      <p className="text-nx-muted">
        Cricket · {match.legsToWin === 1 ? '1 leg' : `best of ${bestOf(match.legsToWin)} legs`} · leg {match.legs.length}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-center tabular-nums">
          <thead>
            <tr>
              <th scope="col" className="py-1 text-left font-normal text-nx-muted">
                Nummer
              </th>
              {match.players.map((p, i) => (
                <th key={p} scope="col" className={`py-1 ${turn === i ? 'text-nx-accent' : ''}`} aria-current={turn === i ? 'true' : undefined}>
                  {label(p)}
                  <span className="block text-xs font-normal text-nx-muted">legs {cricketLegsWon(match, i)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CRICKET_TARGETS.map((t) => {
              const closedByAll = board.marks.every((m) => m[t] >= 3)
              return (
                <tr key={t} className={`border-t border-nx-border ${closedByAll ? 'opacity-50' : ''}`}>
                  <th scope="row" className="py-1 text-left">
                    {targetName(t)}
                  </th>
                  {match.players.map((p, i) => (
                    <td key={p} className="py-1 text-lg" aria-label={`${p} op ${targetName(t)}: ${markWord(board.marks[i][t])}`}>
                      {markSign(board.marks[i][t])}
                    </td>
                  ))}
                </tr>
              )
            })}
            <tr className="border-t border-nx-border font-semibold">
              <th scope="row" className="py-1 text-left">
                Punten
              </th>
              {match.players.map((p, i) => (
                <td key={p} className="py-1" aria-label={`Punten van ${p}`}>
                  {board.points[i]}
                </td>
              ))}
            </tr>
            <tr className="text-xs text-nx-muted">
              <th scope="row" className="py-1 text-left font-normal">
                MPR
              </th>
              {match.players.map((p, i) => (
                <td key={p} className="py-1">
                  {two(marksPerRound(match, i))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {turn !== null && (
        <div className="space-y-2" role="group" aria-label="Beurt">
          <p>
            <b>{label(match.players[turn])}</b> gooit. Pijlen: {darts.length === 0 ? <span className="text-nx-muted">nog geen</span> : darts.map(cricketLabel).join(', ')}
          </p>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Soort treffer">
            {([1, 2, 3] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={mult === k} className={`${small} ${mult === k ? 'bg-nx-surface-2 font-medium' : ''}`} onClick={() => setMult(k)}>
                {k === 1 ? 'Single' : k === 2 ? 'Double' : 'Triple'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {CRICKET_TARGETS.map((t) => (
              <button key={t} type="button" className={button} disabled={darts.length >= 3} onClick={() => tap(t)}>
                {targetName(t)}
              </button>
            ))}
            <button type="button" className={button} disabled={darts.length >= 3} onClick={() => tap(0)}>
              Mis
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButton} onClick={submit}>
              {darts.length < 3 ? 'Beurt invoeren (rest mis)' : 'Beurt invoeren'}
            </button>
            <button type="button" className={small} disabled={darts.length === 0} onClick={() => setDarts(darts.slice(0, -1))}>
              Pijl terug
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      {match.winner !== null && (
        <p role="status" className="font-medium">
          {label(match.players[match.winner])} wint met {match.players.map((_, i) => cricketLegsWon(match, i)).join('–')}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={leg.visits.length === 0 && match.legs.length === 1} onClick={() => saveCricket(undoCricket(match, Date.now()))}>
          Ongedaan maken
        </button>
        {cricketRunning(match) ? (
          <button
            type="button"
            className={button}
            onClick={() =>
              saveCricket({
                ...match,
                finishedAt: Date.now(),
                updatedAt: Date.now(),
              })
            }
          >
            Wedstrijd stoppen
          </button>
        ) : (
          <button
            type="button"
            className={primaryButton}
            onClick={() => {
              const again = newCricket(crypto.randomUUID(), [...match.players.slice(1), match.players[0]], match.legsToWin, Date.now())
              if (!('error' in again)) saveCricket(again)
            }}
          >
            Nog een wedstrijd
          </button>
        )}
      </div>
    </section>
  )
}

/** The summary of a Cricket match, per player. */
export function CricketSummary({ match }: { match: CricketMatch }) {
  const { settings } = useDarts()
  const s = cricketSummary(match)
  const rows: Array<[string, (x: (typeof s)[number]) => string | number]> = [
    ['Legs', (x) => x.legsWon],
    ['MPR', (x) => two(x.mpr)],
    ['Beurten', (x) => x.rounds],
    ['Triples', (x) => x.triples],
    ['Bull-treffers', (x) => x.bulls],
    ['Beurten met 5+ treffers', (x) => x.fivePlus],
    ['Beurten met 9 treffers', (x) => x.nineMarks],
  ]
  return (
    <section aria-label="Samenvatting van de wedstrijd" className="space-y-2 rounded-lg border border-nx-border p-3">
      <h3 className="font-medium">Samenvatting</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left tabular-nums">
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-3">
                <span className="sr-only">Cijfer</span>
              </th>
              {s.map((x, i) => (
                <th key={x.name} scope="col" className={`py-1 pr-3 ${match.winner === i ? 'text-nx-accent' : ''}`}>
                  {playerLabel(settings, x.name)}
                  {match.winner === i && <span className="ml-1 text-xs font-normal">wint</span>}
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
                {s.map((x) => (
                  <td key={x.name} className="py-1 pr-3">
                    {value(x)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
