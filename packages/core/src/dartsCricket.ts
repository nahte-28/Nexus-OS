// Darts: Cricket. Close 20 down to 15 and the bull with three marks each; marks on a number you
// closed score points while someone else still has it open. Kept with your matches (key 'darts'). Pure logic.

/** The numbers of Cricket, in board order: 20 down to 15, then the bull (25). */
export const CRICKET_TARGETS = [20, 19, 18, 17, 16, 15, 25] as const
export type CricketTarget = (typeof CRICKET_TARGETS)[number]
export const MAX_CRICKET = 200
const MAX_VISITS = 300

/** One dart: a Cricket number with single, double or triple (the bull has no triple), or a miss (target 0). */
export interface CricketDart {
  target: CricketTarget | 0
  mult: 1 | 2 | 3
}

export interface CricketVisit {
  player: number
  darts: CricketDart[]
}

export interface CricketLeg {
  starter: number
  visits: CricketVisit[]
  winner: number | null
}

export interface CricketMatch {
  id: string
  players: string[]
  legsToWin: number
  legs: CricketLeg[]
  winner: number | null
  startedAt: number
  finishedAt: number | null
  updatedAt: number
  deletedAt: number | null
}

export interface CricketBoard {
  /** Marks per player per target (0 to 3 count; more only score). */
  marks: Array<Record<CricketTarget, number>>
  points: number[]
}

const isTarget = (v: unknown): v is CricketTarget => CRICKET_TARGETS.includes(v as CricketTarget)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const emptyMarks = (): Record<CricketTarget, number> => ({
  20: 0,
  19: 0,
  18: 0,
  17: 0,
  16: 0,
  15: 0,
  25: 0,
})

export const cricketLabel = (d: CricketDart): string => (d.target === 0 ? 'mis' : d.target === 25 ? (d.mult === 2 ? 'Bull' : '25') : `${d.mult === 3 ? 'T' : d.mult === 2 ? 'D' : ''}${d.target}`)

export function newCricket(id: string, players: string[], legsToWin: number, now: number): CricketMatch | { error: string } {
  const names = players.map((p) => p.trim().slice(0, 30)).filter(Boolean)
  if (names.length === 0) return { error: 'Geef minstens één speler een naam.' }
  if (names.length > 4) return { error: 'Hoogstens 4 spelers.' }
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) return { error: 'Twee spelers hebben dezelfde naam.' }
  return {
    id,
    players: names,
    legsToWin: Math.min(11, Math.max(1, Math.round(legsToWin))),
    legs: [{ starter: 0, visits: [], winner: null }],
    winner: null,
    startedAt: now,
    finishedAt: null,
    updatedAt: now,
    deletedAt: null,
  }
}

export const cricketLeg = (m: CricketMatch): CricketLeg => m.legs[m.legs.length - 1]

/** The marks and points after the visits of [leg]. */
export function cricketBoard(m: Pick<CricketMatch, 'players'>, leg: CricketLeg): CricketBoard {
  const marks = m.players.map(emptyMarks)
  const points = m.players.map(() => 0)
  for (const v of leg.visits) {
    for (const d of v.darts) {
      const t = d.target
      if (t === 0) continue
      const mine = marks[v.player]
      const before = mine[t]
      const after = before + d.mult
      const extra = Math.max(0, after - Math.max(3, before))
      mine[t] = Math.min(3, after)
      if (extra > 0 && marks.some((o, i) => i !== v.player && o[t] < 3)) points[v.player] += extra * t
    }
  }
  return { marks, points }
}

/** Who throws now, or null when the match is over. */
export function cricketToThrow(m: CricketMatch): number | null {
  if (m.winner !== null || m.finishedAt !== null) return null
  const leg = cricketLeg(m)
  return (leg.starter + leg.visits.length) % m.players.length
}

/** Whether [player] closed everything and has at least as many points as every other player. */
function wins(board: CricketBoard, player: number): boolean {
  return CRICKET_TARGETS.every((t) => board.marks[player][t] >= 3) && board.points.every((p, i) => i === player || board.points[player] >= p)
}

export const cricketLegsWon = (m: CricketMatch, player: number) => m.legs.filter((l) => l.winner === player).length

/** Adds the visit of whoever throws now: up to three darts, the rest are misses. */
export function addCricketVisit(m: CricketMatch, darts: CricketDart[], now: number): CricketMatch | { error: string } {
  const player = cricketToThrow(m)
  if (player === null) return { error: 'Deze wedstrijd is al gedaan.' }
  if (darts.length > 3) return { error: 'Een beurt is hoogstens drie pijlen.' }
  if (darts.some((d) => d.target !== 0 && (!isTarget(d.target) || ![1, 2, 3].includes(d.mult) || (d.target === 25 && d.mult === 3)))) return { error: 'Die pijl bestaat niet.' }
  const leg = cricketLeg(m)
  if (leg.visits.length >= MAX_VISITS) return { error: 'Te veel beurten voor één leg.' }
  const full = [...darts.map((d) => (d.target === 0 ? { target: 0 as const, mult: 1 as const } : d))]
  while (full.length < 3) full.push({ target: 0, mult: 1 })
  const visits = [...leg.visits, { player, darts: full }]
  const board = cricketBoard(m, { ...leg, visits })
  const won = wins(board, player)
  const done: CricketLeg = { ...leg, visits, winner: won ? player : null }
  let next: CricketMatch = {
    ...m,
    legs: [...m.legs.slice(0, -1), done],
    updatedAt: now,
  }
  if (won) {
    if (cricketLegsWon(next, player) >= m.legsToWin) next = { ...next, winner: player, finishedAt: now }
    else
      next = {
        ...next,
        legs: [
          ...next.legs,
          {
            starter: (leg.starter + 1) % m.players.length,
            visits: [],
            winner: null,
          },
        ],
      }
  }
  return next
}

/** Takes the last visit back, also when it won a leg or the match. */
export function undoCricket(m: CricketMatch, now: number): CricketMatch {
  let legs = m.legs
  if (cricketLeg(m).visits.length === 0 && legs.length > 1) legs = legs.slice(0, -1)
  const leg = legs[legs.length - 1]
  return {
    ...m,
    legs: [...legs.slice(0, -1), { ...leg, visits: leg.visits.slice(0, -1), winner: null }],
    winner: null,
    finishedAt: null,
    updatedAt: now,
  }
}

/** Marks per round (three darts) for [player]; marks beyond three on a number count too. Null before a visit. */
export function marksPerRound(m: CricketMatch, player: number, leg?: CricketLeg): number | null {
  let marks = 0
  let rounds = 0
  for (const l of leg ? [leg] : m.legs) {
    for (const v of l.visits) {
      if (v.player !== player) continue
      rounds++
      marks += v.darts.reduce((n, d) => n + (d.target === 0 ? 0 : d.mult), 0)
    }
  }
  return rounds > 0 ? Math.round((marks / rounds) * 100) / 100 : null
}

export interface CricketSideSummary {
  name: string
  legsWon: number
  mpr: number | null
  rounds: number
  /** Visits with 5 marks or more, and with all 9 (three triples). */
  fivePlus: number
  nineMarks: number
  triples: number
  bulls: number
}

/** The summary of a Cricket match, per player. */
export function cricketSummary(m: CricketMatch): CricketSideSummary[] {
  return m.players.map((name, p) => {
    const mine = m.legs.flatMap((l) => l.visits.filter((v) => v.player === p))
    const count = (v: CricketVisit) => v.darts.reduce((n, d) => n + (d.target === 0 ? 0 : d.mult), 0)
    return {
      name,
      legsWon: cricketLegsWon(m, p),
      mpr: marksPerRound(m, p),
      rounds: mine.length,
      fivePlus: mine.filter((v) => count(v) >= 5).length,
      nineMarks: mine.filter((v) => count(v) === 9).length,
      triples: mine.reduce((n, v) => n + v.darts.filter((d) => d.mult === 3 && d.target !== 0).length, 0),
      bulls: mine.reduce((n, v) => n + v.darts.filter((d) => d.target === 25).reduce((k, d) => k + d.mult, 0), 0),
    }
  })
}

// Parsing and merging -------------------------------------------------------------------------------

function parseDart(raw: unknown): CricketDart {
  const d = raw as Record<string, unknown> | null
  const target = d?.target
  const mult = num(d?.mult)
  if (!isTarget(target) || (mult !== 1 && mult !== 2 && mult !== 3) || (target === 25 && mult === 3)) return { target: 0, mult: 1 }
  return { target, mult }
}

export function parseCricket(raw: unknown): CricketMatch | null {
  if (typeof raw !== 'object' || raw === null) return null
  const m = raw as Record<string, unknown>
  if (typeof m.id !== 'string' || !Array.isArray(m.players)) return null
  const players = m.players
    .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
    .map((p) => p.slice(0, 30))
    .slice(0, 4)
  if (players.length === 0) return null
  const who = (v: unknown) => {
    const n = num(v)
    return n !== null && n >= 0 && n < players.length ? Math.round(n) : null
  }
  const legs = (Array.isArray(m.legs) ? m.legs : []).flatMap((l): CricketLeg[] => {
    if (typeof l !== 'object' || l === null) return []
    const leg = l as Record<string, unknown>
    const visits = (Array.isArray(leg.visits) ? leg.visits : []).slice(0, MAX_VISITS).flatMap((x): CricketVisit[] => {
      const v = x as Record<string, unknown> | null
      const player = who(v?.player)
      if (!v || player === null || !Array.isArray(v.darts)) return []
      return [{ player, darts: v.darts.slice(0, 3).map(parseDart) }]
    })
    return [{ starter: who(leg.starter) ?? 0, visits, winner: who(leg.winner) }]
  })
  const toWin = num(m.legsToWin)
  return {
    id: m.id.slice(0, 80),
    players,
    legsToWin: toWin !== null && toWin >= 1 && toWin <= 11 ? Math.round(toWin) : 1,
    legs: legs.length > 0 ? legs : [{ starter: 0, visits: [], winner: null }],
    winner: who(m.winner),
    startedAt: num(m.startedAt) ?? 0,
    finishedAt: num(m.finishedAt),
    updatedAt: num(m.updatedAt) ?? 0,
    deletedAt: num(m.deletedAt),
  }
}

export function mergeCricket(a: CricketMatch[], b: CricketMatch[]): CricketMatch[] {
  const byId = new Map(a.map((m) => [m.id, m]))
  for (const m of b) {
    const mine = byId.get(m.id)
    if (!mine || m.updatedAt > mine.updatedAt) byId.set(m.id, m)
  }
  return [...byId.values()].sort((x, y) => y.startedAt - x.startedAt).slice(0, MAX_CRICKET)
}
