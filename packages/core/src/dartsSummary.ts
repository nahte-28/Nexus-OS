// Darts: the summary of one match, shown when it ends and from the history. Pure logic.
import { legsWon, setsWon, type DartsLeg, type DartsMatch } from './darts'

export interface SideSummary {
  side: number
  name: string
  legsWon: number
  setsWon: number
  /** Points per three darts; a bust counts as three darts for nothing. */
  average: number | null
  /** The same over the first three visits of each leg. */
  first9: number | null
  dartsThrown: number
  /** Highest visit that counted. */
  highestScore: number
  /** Visits of 60+, 100+, 140+ and 180 (each visit counts once, in its own band). */
  sixtyPlus: number
  tons: number
  tonForty: number
  oneEighties: number
  highestFinish: number
  /** Fewest and most darts in a leg this side won, or null. */
  bestLeg: number | null
  worstLeg: number | null
  /** Legs thrown out, and darts at a double where that was asked. */
  checkouts: number
  doubleDarts: number
  /** Checkouts per dart at a double, 0 to 100, or null when no darts at a double were noted. */
  checkoutPct: number | null
}

export interface LegSummary {
  /** 1-based leg number in the match, and its set (1-based). */
  number: number
  set: number
  winner: number | null
  /** Darts the winner needed, and the finish. */
  darts: number | null
  finish: number | null
  /** Average per side in this leg. */
  averages: Array<number | null>
}

export interface MatchSummary {
  /** Minutes from the first to the last visit, or null. */
  minutes: number | null
  legsPlayed: number
  sides: SideSummary[]
  legs: LegSummary[]
  /** The side with the best average, for the headline; null with fewer than two sides or no visits. */
  bestAverage: number | null
}

const round2 = (x: number) => Math.round(x * 100) / 100
const avg = (points: number, darts: number) => (darts > 0 ? round2((points / darts) * 3) : null)

function legAverage(leg: DartsLeg, side: number): number | null {
  let points = 0
  let darts = 0
  for (const v of leg.visits) {
    if (v.player !== side) continue
    points += v.bust ? 0 : v.score
    darts += v.darts
  }
  return avg(points, darts)
}

/** Everything worth seeing after a match: per side and per leg. Works on a running match too. */
export function matchSummary(m: DartsMatch): MatchSummary {
  const played = m.legs.filter((l) => l.visits.length > 0)
  const sides: SideSummary[] = m.players.map((name, side) => {
    let points = 0
    let darts = 0
    let points9 = 0
    let darts9 = 0
    const s: SideSummary = {
      side,
      name,
      legsWon: legsWon(m, side),
      setsWon: m.setsToWin > 1 ? setsWon(m, side) : 0,
      average: null,
      first9: null,
      dartsThrown: 0,
      highestScore: 0,
      sixtyPlus: 0,
      tons: 0,
      tonForty: 0,
      oneEighties: 0,
      highestFinish: 0,
      bestLeg: null,
      worstLeg: null,
      checkouts: 0,
      doubleDarts: 0,
      checkoutPct: null,
    }
    let asked = false
    for (const leg of played) {
      const mine = leg.visits.filter((v) => v.player === side)
      let legDarts = 0
      mine.forEach((v, i) => {
        const scored = v.bust ? 0 : v.score
        points += scored
        darts += v.darts
        legDarts += v.darts
        if (i < 3) {
          points9 += scored
          darts9 += v.darts
        }
        s.highestScore = Math.max(s.highestScore, scored)
        if (scored === 180) s.oneEighties++
        else if (scored >= 140) s.tonForty++
        else if (scored >= 100) s.tons++
        else if (scored >= 60) s.sixtyPlus++
        if (v.doubles !== undefined) {
          asked = true
          s.doubleDarts += v.doubles
        }
      })
      if (leg.winner === side && mine.length > 0) {
        s.checkouts++
        s.highestFinish = Math.max(s.highestFinish, mine[mine.length - 1].score)
        s.bestLeg = s.bestLeg === null ? legDarts : Math.min(s.bestLeg, legDarts)
        s.worstLeg = s.worstLeg === null ? legDarts : Math.max(s.worstLeg, legDarts)
      }
    }
    s.dartsThrown = darts
    s.average = avg(points, darts)
    s.first9 = avg(points9, darts9)
    s.checkoutPct = asked && s.doubleDarts > 0 ? Math.round((s.checkouts / s.doubleDarts) * 1000) / 10 : null
    return s
  })
  const legs: LegSummary[] = played.map((leg, i) => {
    const won = leg.winner !== null ? leg.visits.filter((v) => v.player === leg.winner) : []
    return {
      number: i + 1,
      set: leg.set + 1,
      winner: leg.winner,
      darts: won.length > 0 ? won.reduce((n, v) => n + v.darts, 0) : null,
      finish: won.length > 0 ? won[won.length - 1].score : null,
      averages: m.players.map((_, side) => legAverage(leg, side)),
    }
  })
  const averages = sides.map((s) => s.average)
  const best = sides.length > 1 && averages.some((a) => a !== null) ? averages.reduce<number>((b, a, i) => ((a ?? -1) > (averages[b] ?? -1) ? i : b), 0) : null
  const minutes = m.finishedAt !== null && played.length > 0 ? Math.max(1, Math.round((m.finishedAt - m.startedAt) / 60_000)) : null
  return { minutes, legsPlayed: played.length, sides, legs, bestAverage: best }
}

/** A short text of the summary, to share: "Ethan 3 – 1 Remo · gem. 54,3 – 47,1". */
export function summaryLine(m: DartsMatch, s: MatchSummary = matchSummary(m)): string {
  const fmt = (n: number | null) => (n === null ? '–' : n.toLocaleString('nl-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
  const score = s.sides.map((x) => (m.setsToWin > 1 ? x.setsWon : x.legsWon)).join(' – ')
  const names = s.sides.map((x) => x.name)
  const head = names.length === 2 ? `${names[0]} ${score} ${names[1]}` : `${names.join(', ')}: ${score}`
  return `${head} · gem. ${s.sides.map((x) => fmt(x.average)).join(' – ')}`
}
