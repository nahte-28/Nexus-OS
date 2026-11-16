/**
 * Darts online: an X01 match against a friend, each on your own device. The database keeps only the
 * visits in order, each with the side that threw it; both devices replay them with the rules of the
 * scorer (addVisit), so the score is the same everywhere and a visit out of turn does not count.
 */
import { addVisit, newMatch, remaining, toThrow, type DartsMatch } from './darts'

export type OnlineStatus = 'invited' | 'playing' | 'done' | 'declined' | 'stopped'
export const ONLINE_STATUSES: OnlineStatus[] = ['invited', 'playing', 'done', 'declined', 'stopped']

export interface OnlineVisit {
  side: 0 | 1
  score: number
  darts: number
  doubles?: number
}

export interface OnlineGame {
  id: string
  /** Your side: 0 when you invited, 1 when you were invited. */
  side: 0 | 1
  /** The host's name, then the guest's. */
  players: [string, string]
  mode: number
  legsToWin: number
  setsToWin: number
  doubleOut: boolean
  status: OnlineStatus
  visits: OnlineVisit[]
  createdAt: number
  updatedAt: number
}

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const time = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? v : NaN)

export function parseOnlineGame(raw: unknown): OnlineGame | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const players = Array.isArray(r.players) ? r.players.map((p) => (typeof p === 'string' ? p.trim().slice(0, 40) : '')) : []
  if (typeof r.id !== 'string' || (r.side !== 0 && r.side !== 1) || players.length !== 2 || !players[0] || !players[1]) return null
  if (!isInt(r.mode, 2, 1001) || !isInt(r.legsToWin, 1, 11) || !isInt(r.setsToWin, 1, 7) || !ONLINE_STATUSES.includes(r.status as OnlineStatus)) return null
  const visits = (Array.isArray(r.visits) ? r.visits : []).flatMap((v): OnlineVisit[] => {
    const x = v as Record<string, unknown>
    if ((x.side !== 0 && x.side !== 1) || !isInt(x.score, 0, 180) || !isInt(x.darts, 1, 3)) return []
    return [{ side: x.side, score: x.score, darts: x.darts, ...(isInt(x.doubles, 0, 3) ? { doubles: x.doubles } : {}) }]
  })
  const createdAt = time(r.createdAt)
  const updatedAt = time(r.updatedAt)
  return {
    id: r.id,
    side: r.side,
    players: [players[0], players[1]],
    mode: r.mode,
    legsToWin: r.legsToWin,
    setsToWin: r.setsToWin,
    doubleOut: r.doubleOut !== false,
    status: r.status as OnlineStatus,
    visits,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  }
}

export function parseOnlineGames(raw: unknown): OnlineGame[] {
  return (Array.isArray(raw) ? raw : []).map(parseOnlineGame).filter((g): g is OnlineGame => g !== null)
}

/** The id the match gets in your Darts history, so saving it again replaces it. */
export const onlineMatchId = (id: string) => `online-${id}`

/** The other player's name. */
export const opponentOf = (g: OnlineGame) => g.players[g.side === 0 ? 1 : 0]

/**
 * The match as the scorer sees it, replayed from the visits. With [me], your side carries your own
 * name, so the statistics count it as yours.
 */
export function replayOnline(g: OnlineGame, me?: string): DartsMatch {
  const names: [string, string] = [...g.players]
  if (me?.trim()) names[g.side] = me.trim().slice(0, 40)
  // Two players with the same name would be refused; the other one keeps a marker.
  if (names[0].toLowerCase() === names[1].toLowerCase()) names[g.side === 0 ? 1 : 0] = `${names[g.side === 0 ? 1 : 0]} (online)`
  const start = newMatch(onlineMatchId(g.id), names, { mode: g.mode, legsToWin: g.legsToWin, setsToWin: g.setsToWin, doubleOut: g.doubleOut }, g.createdAt)
  if ('error' in start) throw new Error(start.error)
  let m: DartsMatch = start
  for (const v of g.visits) {
    if (toThrow(m) !== v.side) continue
    const next = addVisit(m, v.score, g.updatedAt, v.darts, v.doubles)
    if ('error' in next) continue
    m = next
  }
  const ended = g.status === 'done' || g.status === 'stopped'
  return ended ? { ...m, finishedAt: m.finishedAt ?? g.updatedAt, updatedAt: g.updatedAt } : m
}

/** Whether it is your turn now. */
export function myTurn(g: OnlineGame): boolean {
  return g.status === 'playing' && toThrow(replayOnline(g)) === g.side
}

/** Whether your own visit is the last one, so you may take it back. */
export const canUndoOnline = (g: OnlineGame) => g.status === 'playing' && g.visits.length > 0 && g.visits[g.visits.length - 1].side === g.side

/** One line for the list: whose turn, the score, or how it ended. */
export function onlineLine(g: OnlineGame): string {
  const other = opponentOf(g)
  if (g.status === 'invited') return g.side === 0 ? `Wacht tot ${other} aanvaardt.` : `${other} daagt je uit.`
  if (g.status === 'declined') return `${other} sloeg de uitnodiging af.`
  const m = replayOnline(g)
  if (m.winner !== null) return m.winner === g.side ? `Je won van ${other}.` : `${other} won.`
  if (g.status === 'stopped') return 'Gestopt.'
  const turn = toThrow(m)
  return turn === g.side ? `Jij gooit, nog ${remaining(m, g.side)}.` : `${other} gooit, nog ${remaining(m, turn ?? 0)}.`
}

/** Whether the replayed match has a winner, so it can be closed as done. */
export const onlineWon = (g: OnlineGame) => replayOnline(g).winner !== null
