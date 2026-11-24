import type { ThemeId } from '@nexus/core'
import { defaultEngine } from '../connect/ConnectContext'
import { proposeTaskPlan, saveTaskPlan } from '../life/autoPlan'
import { lifeStore } from '../life/store'
import { apiBase } from '../platform/desktop'
import { remindersStore } from '../reminders/store'
import { notesStore } from '../state/notesStore'
import { loadSupabase } from '../sync/config'
import { aiContextStore, approvalLog } from './context'
import { AssistantSession, httpTransport } from './session'

let applyTheme: (theme: ThemeId) => void = () => {}

/** The theme lives in React context; the open Assistant window hands its setter over. */
export function bindTheme(setTheme: (theme: ThemeId) => void): void {
  applyTheme = setTheme
}

/** One conversation for the whole app, so closing the window does not lose it. */
export const assistant = new AssistantSession(
  httpTransport(apiBase, async () => (await (await loadSupabase())?.auth.getSession())?.data.session?.access_token ?? null),
  () => ({
    notes: notesStore,
    reminders: remindersStore,
    life: lifeStore,
    connect: defaultEngine,
    setTheme: (theme) => applyTheme(theme),
    now: Date.now,
    planTask: async (task) => {
      const plan = proposeTaskPlan(task)
      await saveTaskPlan(task.title, plan)
      return plan
    },
  }),
  { context: aiContextStore.getSnapshot, log: (entry) => approvalLog.add(entry) },
)

aiContextStore.subscribe(() => assistant.contextChanged())
