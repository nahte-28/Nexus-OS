import type { DeadlineDraft, ReminderDraft } from '@nexus/core'
import { lifeStore } from '../life/store'
import { remindersStore } from '../reminders/store'
import { notesStore } from '../state/notesStore'

/**
 * Making a note, reminder or deadline, in one place for Ctrl+K and Flow Studio. Input is checked
 * before it gets here, with parseReminder / parseDeadline from core (the same rules as the forms
 * and NEXUS AI), so these only store.
 */

/** A new note; returns its id. */
export function createNote(note: { title: string; body?: string }): string {
  const id = notesStore.add()
  const title = note.title.trim().slice(0, 200)
  const body = note.body ?? ''
  if (title || body) notesStore.update(id, { ...(title ? { title } : {}), ...(body ? { body } : {}) })
  return id
}

export async function createReminder(draft: ReminderDraft, now: number): Promise<string> {
  const reminder = await remindersStore.add(draft, now)
  return reminder.id
}

export async function createDeadline(draft: DeadlineDraft, now: number): Promise<string> {
  return lifeStore.addDeadline(draft, now)
}
