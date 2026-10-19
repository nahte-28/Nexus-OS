import { useCallback, useEffect, useState } from 'react'
import { createNote, parseNotes, sortNotes, type Note } from '@nexus/core'
import { readStorage, writeStorage } from './storage'

const STORAGE_KEY = 'nexus.notes'

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>(() => sortNotes(parseNotes(readStorage(STORAGE_KEY))))

  useEffect(() => {
    writeStorage(STORAGE_KEY, JSON.stringify(notes))
  }, [notes])

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setNotes(sortNotes(parseNotes(e.newValue)))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const add = useCallback(() => {
    const note = createNote()
    setNotes((prev) => [note, ...prev])
    return note.id
  }, [])

  const update = useCallback((id: string, patch: Partial<Pick<Note, 'title' | 'body'>>) => {
    setNotes((prev) => sortNotes(prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n))))
  }, [])

  const remove = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }, [])

  return { notes, add, update, remove }
}
