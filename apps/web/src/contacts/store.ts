import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeContacts, parseContacts, type ContactsState } from '@nexus/core'
import { createProblem, DocStore, startDocSync } from '../state/docStore'

export const CONTACTS_MIGRATION = 'supabase/migrations/20261106090000_contacts.sql'

/** Contacten: your address book and birthday settings (user_settings key 'contacts'). */
export const contactsStore = new DocStore<ContactsState>('nexus.contacts', parseContacts)
export const contactsSyncProblem = createProblem()

export const useContacts = () => useSyncExternalStore(contactsStore.subscribe, contactsStore.getSnapshot)

/** Syncs once the module is switched on, so an account without the SQL step gets no errors. */
export function startContactsSync(client: SupabaseClient | null, enabled: () => boolean, onEnabled: (l: () => void) => () => void): () => void {
  let stop: (() => void) | null = null
  const start = () => {
    if (stop || !enabled()) return
    stop = startDocSync(client, contactsStore, { key: 'contacts', parse: parseContacts, merge: (a, b) => mergeContacts(a, b), migration: CONTACTS_MIGRATION, problem: contactsSyncProblem, label: 'Contacten' })
  }
  start()
  const off = onEnabled(start)
  return () => {
    off()
    stop?.()
  }
}
