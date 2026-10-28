import { mergeJournal, parseJournalState, MAX_JOURNAL_NOTE, type JournalState, type Mood } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createProblem, DocStore, startDocSync } from '../state/docStore'

export const JOURNAL_MIGRATION = 'supabase/migrations/20261028120000_exams_journal.sql'

export const journalStore = new DocStore<JournalState>('nexus.journal', parseJournalState)
export const journalSyncProblem = createProblem()

export function startJournalSync(client: SupabaseClient | null): () => void {
  return startDocSync(client, journalStore, { key: 'journal', parse: parseJournalState, merge: mergeJournal, migration: JOURNAL_MIGRATION, problem: journalSyncProblem, label: 'Dagboek' })
}

/** Writes the entry of [day]; an empty one (no mood, no note) counts as deleted. */
export function writeEntry(day: string, patch: { mood?: Mood | null; note?: string }, now = Date.now()) {
  journalStore.update((s) => {
    const old = s.entries.find((e) => e.date === day)
    const mood = patch.mood !== undefined ? patch.mood : (old?.deletedAt === null ? old.mood : null)
    const note = (patch.note !== undefined ? patch.note : old?.deletedAt === null ? old.note : '').slice(0, MAX_JOURNAL_NOTE)
    const entry = { date: day, mood, note, updatedAt: now, deletedAt: mood === null && !note.trim() ? now : null }
    return { ...s, entries: old ? s.entries.map((e) => (e.date === day ? entry : e)) : [...s.entries, entry] }
  })
}
