/**
 * Darts-ranglijst met vrienden: a standing of your finished online matches. You and every friend
 * you played get a row with matches, wins, average and highest finish; a friend's numbers count
 * only the matches against you, since NEXUS only knows those.
 */
import { dartsStats, type DartsMatch } from './darts'

export interface RankingRow {
  name: string
  me: boolean
  matches: number
  won: number
  /** Points per three darts. */
  average: number
  highestCheckout: number
  /** Only on a friend's row: your wins and theirs against each other. */
  head?: { mine: number; theirs: number }
}

const ONLINE = 'online-'
const MARK = ' (online)'
const key = (s: string) => s.trim().toLowerCase()
const clean = (s: string) => (s.endsWith(MARK) ? s.slice(0, -MARK.length) : s).trim()

/** The standing over your finished online matches in [matches]; [me] is your name in Darts. */
export function dartsRanking(matches: DartsMatch[], me: string): RankingRow[] {
  const mine = key(me)
  if (!mine) return []
  const online = matches.filter((m) => m.deletedAt === null && m.id.startsWith(ONLINE) && m.winner !== null && m.players.length === 2)
  const played: DartsMatch[] = []
  const byFriend = new Map<string, { name: string; matches: DartsMatch[] }>()
  for (const m of online) {
    const side = m.players.findIndex((p) => key(p) === mine)
    if (side < 0) continue
    played.push(m)
    const name = clean(m.players[side === 0 ? 1 : 0])
    const k = key(name)
    const entry = byFriend.get(k) ?? { name, matches: [] }
    entry.matches.push(m)
    byFriend.set(k, entry)
  }
  if (played.length === 0) return []
  const row = (name: string, stats: ReturnType<typeof dartsStats>, isMe: boolean): RankingRow => ({
    name,
    me: isMe,
    matches: stats.matches,
    won: stats.matchesWon,
    average: Math.round(stats.average * 10) / 10,
    highestCheckout: stats.highestCheckout,
  })
  const rows: RankingRow[] = [row(me.trim(), dartsStats(played, me), true)]
  for (const { name, matches: list } of byFriend.values()) {
    // The friend keeps one name over all matches, also where it got " (online)" for being yours.
    const same = list.map((m) => ({ ...m, members: m.members.map((side, i) => (key(m.players[i]) === mine ? side : [name])) }))
    const stats = dartsStats(same, name)
    rows.push({ ...row(name, stats, false), head: { mine: stats.matches - stats.matchesWon, theirs: stats.matchesWon } })
  }
  return rows.sort((a, b) => b.won / b.matches - a.won / a.matches || b.average - a.average || a.name.localeCompare(b.name))
}
