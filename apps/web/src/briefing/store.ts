import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { briefingLines, buildBriefing, logBriefing, mergeBriefing, parseBriefing, unsorted, type BriefingChannel, type BriefingInput, type BriefingState, type DagstartExtra } from '@nexus/core'
import { capturesStore } from '../capture/hub'
import { isFeatureOn } from '../features/store'
import { habitsStore } from '../habits/store'
import { lifeStore } from '../life/store'
import { profilesStore } from '../profiles/store'
import { remindersStore } from '../reminders/store'
import { createProblem, DocStore, startDocSync } from '../state/docStore'
import { examsStore } from '../study/exams'

export const BRIEFING_MIGRATION = 'supabase/migrations/20261030120000_modules.sql'

/** Dagbriefing: the history of sent Dagstarts (user_settings key 'briefing'). */
export const briefingStore = new DocStore<BriefingState>('nexus.briefing', parseBriefing)
export const briefingSyncProblem = createProblem()

export const useBriefingState = () => useSyncExternalStore(briefingStore.subscribe, briefingStore.getSnapshot)

/** Agenda, habits, exams and what waits in Te sorteren, as the Dagbriefing reads them. */
export function briefingInput(): BriefingInput {
  const { state } = profilesStore.getSnapshot()
  return {
    calendarEvents: state.calendarEvents,
    googleEvents: state.googleEvents,
    timetable: state.lessons,
    items: lifeStore.getSnapshot(),
    reminders: remindersStore.getSnapshot(),
    habits: habitsStore.getSnapshot(),
    exams: examsStore.getSnapshot(),
    unsortedCaptures: isFeatureOn('capture') ? unsorted(capturesStore.getSnapshot()).length : 0,
  }
}

/**
 * The lines the Dagstart notification adds while the Dagbriefing is on. Each day is worked out as it
 * stands at the moment of its Dagstart, so the plan for the phone stays the same from minute to minute.
 */
export function dagstartExtra(): DagstartExtra | undefined {
  if (!isFeatureOn('briefing')) return undefined
  const input = briefingInput()
  return (dayStart, at) => briefingLines(buildBriefing(input, dayStart, at))
}

/** Remembers that a Dagstart went out; does nothing while the module is off. */
export function recordBriefing(date: string, channel: BriefingChannel, title: string, test = false, now = Date.now()): void {
  if (!isFeatureOn('briefing')) return
  briefingStore.update((s) => logBriefing(s, { date, channel, at: now, title, test }))
}

/** Syncs once the module is switched on, so an account without the SQL step gets no errors. */
export function startBriefingSync(client: SupabaseClient | null, enabled: () => boolean, onEnabled: (l: () => void) => () => void): () => void {
  let stop: (() => void) | null = null
  const start = () => {
    if (stop || !enabled()) return
    stop = startDocSync(client, briefingStore, { key: 'briefing', parse: parseBriefing, merge: mergeBriefing, migration: BRIEFING_MIGRATION, problem: briefingSyncProblem, label: 'Dagbriefing' })
  }
  start()
  const off = onEnabled(start)
  return () => {
    off()
    stop?.()
  }
}
