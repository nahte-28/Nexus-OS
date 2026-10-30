import {
  mergeSpaces,
  parseSpacesState,
  parseCaptures,
  mergeCaptures,
  parseProjectHub,
  mergeProjectHub,
  parseKnowledge,
  mergeKnowledge,
  parseStudyLab,
  mergeStudyLab,
  parseGaming,
  mergeGaming,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  fromBase64,
  mergeExams,
  mergeFinance,
  mergeFlashcards,
  mergeGrades,
  mergeHabits,
  mergeJournal,
  parseExamsState,
  parseFinanceState,
  parseFlashcardsState,
  parseGradesState,
  parseHabitsState,
  parseJournalState,
  parseProfilesState,
  toBase64,
  type BackupDoc,
  type NexusBackup,
} from '@nexus/core'
import { filesStore } from '../files/store'
import { capturesStore } from '../capture/hub'
import { financeStore } from '../finance/store'
import { projectHubStore } from '../projecthub/store'
import { knowledgeStore } from '../knowledge/store'
import { studyLabStore } from '../studylab/store'
import { gamingStore } from '../gaming/store'
import { flashcardsStore } from '../flashcards/store'
import { flowsStore, parseFlowsState } from '../flows/store'
import { gradesStore } from '../grades/store'
import { habitsStore } from '../habits/store'
import { journalStore } from '../journal/store'
import { spacesStore } from '../spaces/store'
import { lifeStore } from '../life/store'
import { profilesStore } from '../profiles/store'
import { remindersStore } from '../reminders/store'
import type { DocStore } from '../state/docStore'
import { notesStore } from '../state/notesStore'
import { examsStore } from '../study/exams'
import { focusStore } from '../study/timer'

interface Doc<T extends { revision: number }> {
  store: DocStore<T>
  parse: (raw: unknown) => T
  merge: (a: T, b: T) => T
}
const doc = <T extends { revision: number }>(store: DocStore<T>, parse: (raw: unknown) => T, merge: (a: T, b: T) => T): Doc<T> => ({ store, parse, merge })

const DOCS: Record<BackupDoc, Doc<any>> = {
  grades: doc(gradesStore, parseGradesState, mergeGrades),
  habits: doc(habitsStore, parseHabitsState, mergeHabits),
  flashcards: doc(flashcardsStore, parseFlashcardsState, mergeFlashcards),
  finance: doc(financeStore, parseFinanceState, mergeFinance),
  exams: doc(examsStore, parseExamsState, mergeExams),
  journal: doc(journalStore, parseJournalState, mergeJournal),
  spaces: doc(spacesStore, parseSpacesState, mergeSpaces),
  captures: doc(capturesStore, parseCaptures, mergeCaptures),
  projecthub: doc(projectHubStore, parseProjectHub, mergeProjectHub),
  knowledge: doc(knowledgeStore, parseKnowledge, mergeKnowledge),
  studylab: doc(studyLabStore, parseStudyLab, mergeStudyLab),
  gaming: doc(gamingStore, parseGaming, mergeGaming),
}

/** Everything on this device in one back-up. Files kept only in your account are fetched first when [withFiles]. */
export async function createBackup({ withFiles = true, now = Date.now() } = {}): Promise<NexusBackup> {
  await Promise.all([notesStore.ready, lifeStore.ready, remindersStore.ready, filesStore.ready])
  const files: NexusBackup['files'] = []
  if (withFiles) {
    for (const f of filesStore.getSnapshot()) {
      try {
        const blob = await filesStore.blob(f.id)
        files.push({ id: f.id, name: f.name, mediaType: f.mediaType, size: f.size, addedAt: f.addedAt, data: toBase64(new Uint8Array(await blob.arrayBuffer())) })
      } catch {
        // Not on this device and no connection: the back-up goes on without it.
      }
    }
  }
  const { flows, deleted } = flowsStore.getSnapshot()
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now,
    notes: notesStore.all(),
    life: lifeStore.all(),
    reminders: remindersStore.getSnapshot(),
    docs: Object.fromEntries(Object.entries(DOCS).map(([key, d]) => [key, d.store.getSnapshot()])),
    profiles: profilesStore.getSnapshot().state,
    flows: { flows, deleted },
    focusLog: focusStore.getSnapshot().log,
    files,
  }
}

export interface RestoreReport {
  notes: number
  life: number
  reminders: number
  files: number
  flows: number
  focus: number
}

/**
 * Puts a back-up back. Records merge per item (the newest wins, nothing only on this device is
 * lost); Profielen take the settings of the back-up.
 */
export async function restoreBackup(b: NexusBackup): Promise<RestoreReport> {
  const notes = await notesStore.restore(b.notes)
  const life = await lifeStore.restore(b.life)
  const reminders = await remindersStore.restore(b.reminders)
  const files = await filesStore.restore(b.files.map((f) => ({ ...f, data: fromBase64(f.data).buffer as ArrayBuffer })))
  for (const [key, raw] of Object.entries(b.docs) as Array<[BackupDoc, unknown]>) {
    const d = DOCS[key]
    d.store.update((s) => d.merge(s, d.parse(raw)))
  }
  if (b.profiles) {
    const parsed = parseProfilesState(b.profiles)
    profilesStore.update(() => ({ ...parsed, revision: Math.max(parsed.revision, profilesStore.getSnapshot().state.revision + 1) }))
  }
  let flows = 0
  if (b.flows) {
    const backup = parseFlowsState({ flows: b.flows.flows, deleted: b.flows.deleted })
    const { flows: mine, deleted } = flowsStore.getSnapshot()
    const ids = new Set(mine.map((f) => f.id))
    const fresh = backup.flows.filter((f) => !ids.has(f.id) && !((deleted[f.id] ?? 0) > f.updatedAt))
    flows = fresh.length
    if (flows > 0) flowsStore.update((s) => ({ ...s, flows: [...s.flows, ...fresh] }))
  }
  const known = new Set(focusStore.getSnapshot().log.map((e) => e.at))
  const focus = b.focusLog.filter((e) => !known.has(e.at))
  for (const e of focus) focusStore.addLog(e)
  return { notes, life, reminders, files, flows, focus: focus.length }
}

/** Saves the back-up as a file in the browser's downloads (or where the Windows app asks). */
export function downloadBackup(b: NexusBackup, name: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(b)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
