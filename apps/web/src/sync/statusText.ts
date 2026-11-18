import type { SyncState } from './engine'

/** The sync status in a few words, for the taskbar and Account. */
export function statusText(state: SyncState): string {
  switch (state.status) {
    case 'unconfigured':
      return 'Alleen op dit apparaat'
    case 'signed-out':
      return 'Niet aangemeld'
    case 'syncing':
      return 'Bezig met synchroniseren…'
    case 'synced':
      return state.pending > 0 ? `${state.pending} wijziging(en) in wachtrij` : 'Gesynchroniseerd'
    case 'offline':
      return state.pending > 0 ? `Offline · ${state.pending} wijziging(en) in wachtrij` : 'Offline'
    case 'error':
      return 'Synchroniseren mislukt'
  }
}
