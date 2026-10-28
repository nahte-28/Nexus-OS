import { actionTarget, deadlinesOf, markDone, type ActionPayload } from '@nexus/core'
import { habitsStore } from '../habits/store'
import { lifeStore } from '../life/store'
import { logEvent } from '../devtools/log'

/**
 * Carries out what was done on another device, e.g. a deadline ticked off on the watch. Marking done
 * twice changes nothing, so it does not matter which open NEXUS gets the message first.
 */
export async function applyAction(action: ActionPayload): Promise<void> {
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
