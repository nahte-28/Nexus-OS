import { actionTarget, deadlinesOf, markDone, watchMatch, watchMatchId, type ActionPayload } from '@nexus/core'
import { habitsStore } from '../habits/store'
import { lifeStore } from '../life/store'
import { logEvent } from '../devtools/log'
import { focusStore } from '../study/timer'
import { applyWatchGaming } from '../gaming/timer'
import { dartsStore } from '../darts/store'

/**
 * Carries out what was done on another device: a deadline or habit ticked off on the watch (marking
 * done twice changes nothing, so it does not matter which open NEXUS gets it first), or a focus round
 * from the watch, which goes in the focus log of this device like its own rounds, or the Gaming timer
 * started or stopped on the watch, or a darts leg scored on the watch.
 */
export async function applyAction(action: ActionPayload): Promise<void> {
  if (action.action === 'gaming') return applyWatchGaming(action.op, action.at)
  if (action.action === 'darts') {
    const state = dartsStore.getSnapshot()
    if (state.matches.some((m) => m.id === watchMatchId(action.id))) return
    const match = watchMatch(action, state.settings.me, action.at)
    if (!match) return
    dartsStore.update((s) => ({ ...s, matches: [match, ...s.matches.filter((m) => m.id !== match.id)] }))
    logEvent('connect', `Darts-leg van het horloge bijgeteld (${match.mode})`)
    return
  }
  if (action.action === 'focus') {
    focusStore.addLog({ at: action.at, minutes: action.minutes, task: action.task || 'Focus op het horloge' })
    logEvent('connect', `Focusronde van ${action.minutes} min op het horloge bijgeteld`)
    return
  }
  const target = actionTarget(action.ref)
  if (!target) return
  if (target.kind === 'deadline') {
    const deadline = deadlinesOf(lifeStore.getSnapshot()).find((d) => d.id === target.id)
    if (!deadline || deadline.doneAt !== null) return
    await lifeStore.updateDeadline(deadline.id, { doneAt: action.at })
    logEvent('connect', `Deadline "${deadline.title}" afgevinkt op een ander apparaat`)
  } else {
    const habit = habitsStore.getSnapshot().habits.find((h) => h.id === target.id && h.deletedAt === null)
    if (!habit) return
    habitsStore.update((s) => ({ ...s, habits: s.habits.map((h) => (h.id === habit.id ? markDone(h, target.date) : h)) }))
    logEvent('connect', `Gewoonte "${habit.name}" afgevinkt op een ander apparaat`)
  }
}
