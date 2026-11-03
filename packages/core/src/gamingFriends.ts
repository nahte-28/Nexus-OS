/**
 * Gamevrienden: in a team you see who is gaming right now (only those who share it, from their
 * Gaming timer) and plan sessions to play together, with doe mee / misschien / niet. Stored in the
 * tables team_playing, team_game_plans and team_game_rsvp (20261103090000_team_gaming.sql). Pure logic.
 */
import type { TeamMember } from './teams'

export type GameAnswer = 'yes' | 'maybe' | 'no'
export const GAME_ANSWERS: GameAnswer[] = ['yes', 'maybe', 'no']
export const GAME_ANSWER_LABELS: Record<GameAnswer, string> = { yes: 'Doe mee', maybe: 'Misschien', no: 'Niet' }
export const GAME_NAME_MAX = 80
export const GAME_PLAN_NOTE_MAX = 200
/** A plan stays in the list until this long after it started. */
export const PLAN_SHOWN_AFTER_MS = 3 * 3_600_000
/** Someone whose playing row is older than this probably forgot to stop: shown as "sinds lang". */
export const PLAYING_STALE_MS = 12 * 3_600_000

export interface TeamPlaying {
  groupId: string
  userId: string
  game: string
  startedAt: number
}

export interface TeamGamePlan {
  id: string
  groupId: string
  game: string
  startsAt: number
  note: string
  createdBy: string
}

export interface TeamGameAnswer {
  planId: string
  userId: string
  answer: GameAnswer
}

/** Plans still to come (or just started), soonest first. */
export function upcomingPlans(plans: TeamGamePlan[], now: number): TeamGamePlan[] {
  return plans.filter((p) => p.startsAt >= now - PLAN_SHOWN_AFTER_MS).sort((a, b) => a.startsAt - b.startsAt)
}

/** Who answered what on a plan, by display name; your own answer apart. */
export function planAnswers(planId: string, answers: TeamGameAnswer[], members: TeamMember[], me: string | null): { names: Record<GameAnswer, string[]>; mine: GameAnswer | null } {
  const names: Record<GameAnswer, string[]> = { yes: [], maybe: [], no: [] }
  let mine: GameAnswer | null = null
  for (const a of answers) {
    if (a.planId !== planId) continue
    if (a.userId === me) mine = a.answer
    const member = members.find((m) => m.userId === a.userId)
    if (member) names[a.answer].push(member.displayName)
  }
  for (const k of GAME_ANSWERS) names[k].sort((x, y) => x.localeCompare(y, 'nl'))
  return { names, mine }
}

/** Who is gaming now in a team, longest first, with their name; you are left out. */
export function playingNow(playing: TeamPlaying[], members: TeamMember[], me: string | null, now: number): Array<TeamPlaying & { name: string; stale: boolean }> {
  return playing
    .filter((p) => p.userId !== me)
    .flatMap((p) => {
      const member = members.find((m) => m.groupId === p.groupId && m.userId === p.userId)
      return member ? [{ ...p, name: member.displayName, stale: now - p.startedAt > PLAYING_STALE_MS }] : []
    })
    .sort((a, b) => a.startedAt - b.startedAt)
}

/** A Dutch error for a new plan, or null when it is fine. */
export function checkGamePlan(game: string, startsAt: number, now: number): string | null {
  if (!game.trim()) return 'Welke game?'
  if (game.trim().length > GAME_NAME_MAX) return `Hoogstens ${GAME_NAME_MAX} tekens voor de game.`
  if (!Number.isFinite(startsAt)) return 'Kies wanneer.'
  if (startsAt < now - 5 * 60_000) return 'Dat moment is al voorbij.'
  if (startsAt > now + 60 * 86_400_000) return 'Plan hoogstens 60 dagen vooruit.'
  return null
}
