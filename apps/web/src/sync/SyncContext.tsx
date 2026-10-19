import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { notesStore } from '../state/notesStore'
import { SyncEngine } from './engine'
import { createNotesRemote, supabase } from './supabase'

const defaultEngine = new SyncEngine(supabase, notesStore, supabase ? createNotesRemote(supabase) : null)
const SyncContext = createContext<SyncEngine>(defaultEngine)

export function SyncProvider({ engine = defaultEngine, children }: { engine?: SyncEngine; children: ReactNode }) {
  useEffect(() => engine.start(), [engine])
  return <SyncContext.Provider value={engine}>{children}</SyncContext.Provider>
}

export function useSync() {
  const engine = useContext(SyncContext)
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot)
  return { engine, state }
}
