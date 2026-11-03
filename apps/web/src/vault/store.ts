import { useSyncExternalStore } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { expiredTrash, forgetFiles, mergeVault, parseVault, storageName, type FileMeta, type VaultState } from '@nexus/core'
import { FILES_BUCKET } from '../files/sync'
import { filesStore, type FilesStore } from '../files/store'
import { createProblem, DocStore, startDocSync } from '../state/docStore'

export const VAULT_MIGRATION = 'supabase/migrations/20261103120000_vault.sql'

/** Vault: tags, collections, links, versions, trash and shares of your files (user_settings key 'vault'). */
export const vaultStore = new DocStore<VaultState>('nexus.vault', parseVault)
export const vaultSyncProblem = createProblem()

export const useVault = () => useSyncExternalStore(vaultStore.subscribe, vaultStore.getSnapshot)

/** Removes files whose 30 days in the trash are over, here and (through the files sync) in your account. */
export async function emptyExpiredTrash(now = Date.now(), files: FilesStore = filesStore, store = vaultStore): Promise<number> {
  await files.ready
  const ids = expiredTrash(store.getSnapshot(), files.getSnapshot(), now)
  for (const id of ids) await files.remove(id, now)
  if (ids.length) store.update((s) => forgetFiles(s, ids))
  return ids.length
}

/** Removes a chain from the trash now, without waiting for the 30 days. */
export async function deleteForGood(ids: string[], now = Date.now(), files: FilesStore = filesStore, store = vaultStore): Promise<void> {
  for (const id of ids) await files.remove(id, now)
  store.update((s) => forgetFiles(s, ids))
}

/**
 * A link to one file in your private storage that anyone with the link can open until it expires.
 * Supabase signs it for [seconds]; it cannot be taken back early, so durations stay short.
 */
export async function createShareLink(client: SupabaseClient, file: FileMeta, seconds: number): Promise<string> {
  const { data: session } = await client.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) throw new Error('Meld je aan om een deellink te maken.')
  const { data, error } = await client.storage.from(FILES_BUCKET).createSignedUrl(`${userId}/${storageName(file.id, file.name)}`, seconds, { download: file.name })
  if (error || !data) throw new Error(error?.message ?? 'De deellink kon niet gemaakt worden.')
  return data.signedUrl
}

/** Syncs once the module is switched on, and empties the trash of what is older than 30 days. */
export function startVault(client: SupabaseClient | null, enabled: () => boolean, onEnabled: (l: () => void) => () => void): () => void {
  let stop: (() => void) | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  const start = () => {
    if (stop || !enabled()) return
    stop = startDocSync(client, vaultStore, { key: 'vault', parse: parseVault, merge: mergeVault, migration: VAULT_MIGRATION, problem: vaultSyncProblem, label: 'Vault' })
    void emptyExpiredTrash()
    timer = setInterval(() => void emptyExpiredTrash(), 60 * 60_000)
  }
  start()
  const off = onEnabled(start)
  return () => {
    off()
    stop?.()
    if (timer) clearInterval(timer)
  }
}
