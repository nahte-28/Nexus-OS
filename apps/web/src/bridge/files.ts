import type { SupabaseClient } from '@supabase/supabase-js'
import { FILES_BUCKET } from '../files/sync'
import { supabase } from '../sync/supabase'

/**
 * Bridge 2.0 files: the file is encrypted here with a fresh AES-GCM key, the ciphertext waits in
 * your own private storage (bucket nexus-files, folder <user>/bridge/), and the key only travels
 * inside the end-to-end encrypted Connect message. Storage and server never see the content.
 */
export interface BridgeStorage {
  /** The folder of the signed-in user, or null when nobody is signed in. */
  userId(): Promise<string | null>
  upload(path: string, data: Blob): Promise<void>
  download(path: string): Promise<Blob>
  remove(path: string): Promise<void>
}

export const bridgePath = (userId: string, transferId: string) => `${userId}/bridge/${transferId}.bin`

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

export async function encryptFile(data: ArrayBuffer): Promise<{ cipher: Blob; key: string; iv: string }> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  return { cipher: new Blob([cipher], { type: 'application/octet-stream' }), key: toB64(raw), iv: toB64(iv) }
}

export async function decryptFile(cipher: ArrayBuffer, key: string, iv: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', fromB64(key), { name: 'AES-GCM' }, false, ['decrypt'])
  try {
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, k, cipher)
  } catch {
    throw new Error('Het bestand kon niet ontsleuteld worden. Vraag het opnieuw te sturen.')
  }
}

/** A Dutch message for a storage error; a missing bucket means the Bestanden SQL was not run. */
export function storageError(err: unknown): string {
  const text = err instanceof Error ? err.message : typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message) : String(err)
  if (/bucket not found/i.test(text)) return 'De opslag voor bestanden bestaat nog niet. Voer eerst supabase/migrations/20261027130000_files.sql uit in Supabase.'
  if (/exceeded the maximum allowed size|payload too large|413/i.test(text)) return 'Dit bestand is te groot voor je opslag (10 MB).'
  if (/object not found|not_found|404/i.test(text)) return 'Het bestand staat niet meer in de opslag. Vraag het opnieuw te sturen.'
  return text || 'De opslag gaf een fout.'
}

export function supabaseBridgeStorage(client: SupabaseClient | null = supabase): BridgeStorage {
  const bucket = () => {
    if (!client) throw new Error('Bestanden sturen werkt met een account.')
    return client.storage.from(FILES_BUCKET)
  }
  return {
    async userId() {
      const { data } = (await client?.auth.getSession()) ?? { data: { session: null } }
      return data.session?.user.id ?? null
    },
    async upload(path, data) {
      const { error } = await bucket().upload(path, data, { contentType: 'application/octet-stream', upsert: false })
      if (error) throw new Error(storageError(error))
    },
    async download(path) {
      const { data, error } = await bucket().download(path)
      if (error || !data) throw new Error(storageError(error ?? 'not found'))
      return data
    },
    async remove(path) {
      const { error } = await bucket().remove([path])
      if (error) throw new Error(storageError(error))
    },
  }
}

export const bridgeStorage = supabaseBridgeStorage()
