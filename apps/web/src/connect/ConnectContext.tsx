import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { defaultSyncEngine } from '../sync/SyncContext'
import { supabase } from '../sync/supabase'
import { ConnectEngine } from './engine'
import { createConnectRemote } from './remote'

const defaultEngine = new ConnectEngine(supabase, supabase ? createConnectRemote(supabase) : null)
defaultSyncEngine.beforeSignOut(() => defaultEngine.leave())

const ConnectContext = createContext<ConnectEngine>(defaultEngine)

export function ConnectProvider({ engine = defaultEngine, children }: { engine?: ConnectEngine; children: ReactNode }) {
  useEffect(() => engine.start(), [engine])
  return <ConnectContext.Provider value={engine}>{children}</ConnectContext.Provider>
}

export function useConnect() {
  const engine = useContext(ConnectContext)
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot)
  return { engine, state }
}
