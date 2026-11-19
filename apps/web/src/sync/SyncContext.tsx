import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { notesStore } from '../state/notesStore'
import { SyncEngine } from './engine'
import { loadSupabase, supabaseConfigured } from './config'
import { createNotesRemote } from './notesRemote'

export const defaultSyncEngine = new SyncEngine(supabaseConfigured ? loadSupabase : null, notesStore, createNotesRemote)
const SyncContext = createContext<SyncEngine>(defaultSyncEngine)

export function SyncProvider({ engine = defaultSyncEngine, children }: { engine?: SyncEngine; children: ReactNode }) {
  useEffect(() => engine.start(), [engine])
  return <SyncContext.Provider value={engine}>{children}</SyncContext.Provider>
}

export function useSync() {
  const engine = useContext(SyncContext)
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot)
  return { engine, state }
}
