import { PRACTICE_LABELS, watchMatch, watchMatchId, watchPractice, watchPracticeId, type ActionPayload } from '@nexus/core'
import { dartsStore } from '../darts/store'
import { applyWatchOnlineVisit } from '../darts/watch'
import { logEvent } from '../devtools/log'

type DartsAction = Extract<ActionPayload, { action: 'darts' | 'darts_practice' | 'darts_online' }>

/** A darts leg, practice round or online visit from the watch; loaded only when one arrives. */
export async function applyDartsAction(action: DartsAction): Promise<void> {
  if (action.action === 'darts') {
    const state = dartsStore.getSnapshot()
    if (state.matches.some((m) => m.id === watchMatchId(action.id))) return
    const match = watchMatch(action, state.settings.me, action.at)
    if (!match) return
    dartsStore.update((s) => ({ ...s, matches: [match, ...s.matches.filter((m) => m.id !== match.id)] }))
    logEvent('connect', `Darts-leg van het horloge bijgeteld (${match.mode})`)
    return
  }
  if (action.action === 'darts_practice') {
    const state = dartsStore.getSnapshot()
    if (state.practice.some((p) => p.id === watchPracticeId(action.id))) return
    const round = watchPractice(action, action.at)
    if (!round) return
    dartsStore.update((s) => ({ ...s, practice: [round, ...s.practice.filter((p) => p.id !== round.id)] }))
    logEvent('connect', `${PRACTICE_LABELS[round.game]} van het horloge bijgeteld`)
    return
  }
  return applyWatchOnlineVisit(action)
}
