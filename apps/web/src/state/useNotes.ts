import { useSyncExternalStore } from 'react'
import { notesStore } from './notesStore'

export function useNotes() {
  const notes = useSyncExternalStore(notesStore.subscribe, notesStore.getSnapshot)
  return {
    notes,
    add: () => notesStore.add(),
    update: notesStore.update.bind(notesStore),
    remove: notesStore.remove.bind(notesStore),
  }
}
