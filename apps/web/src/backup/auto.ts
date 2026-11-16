import { autoBackupDue, autoBackupName, autoBackups, autoBackupsToPrune, backupSummary, formatSize, MAX_FILE_BYTES, type AutoBackupSettings } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { filesStore } from '../files/store'
import { filesSynced } from '../files/sync'
import { profilesStore } from '../profiles/store'
import { createBackup } from './backup'

/** How the last automatic back-up on this device went; only on this device. */
export interface AutoBackupStatus {
  at: number
  ok: boolean
  text: string
}

const STATUS_KEY = 'nexus.autobackup.status'
const FIRST_CHECK_MS = 2 * 60_000
const CHECK_MS = 30 * 60_000

export function autoBackupStatus(): AutoBackupStatus | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STATUS_KEY) ?? 'null') as AutoBackupStatus | null
    return raw && typeof raw.at === 'number' && typeof raw.text === 'string' ? raw : null
  } catch {
    return null
  }
}

function setStatus(status: AutoBackupStatus): void {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(status))
  } catch {
    // Private mode: the status is only missing.
  }
}

export const autoBackupSettings = (): AutoBackupSettings => profilesStore.getSnapshot().state.autoBackup

export function setAutoBackup(change: Partial<AutoBackupSettings>): void {
  profilesStore.update((s) => ({ ...s, autoBackup: { ...s.autoBackup, ...change } }))
}

/**
 * Makes an automatic back-up now and keeps it in Bestanden, then removes the oldest ones beyond
 * the number to keep. Returns the line for the status.
 */
export async function makeAutoBackup(settings = autoBackupSettings(), now = Date.now()): Promise<AutoBackupStatus> {
  try {
    const backup = await createBackup({ withFiles: settings.withFiles, now })
    const summary = backupSummary(backup)
    if (summary.length === 0) return { at: now, ok: false, text: 'Nog niets om te bewaren.' }
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
    if (blob.size > MAX_FILE_BYTES) {
      const status = { at: now, ok: false, text: `De back-up is te groot voor Bestanden (${formatSize(blob.size)}, hoogstens ${formatSize(MAX_FILE_BYTES)}). Zet "ook je bestanden" uit, of maak de back-up met de hand.` }
      setStatus(status)
      return status
    }
    await filesStore.add(blob, autoBackupName(now), now)
    for (const old of autoBackupsToPrune(filesStore.getSnapshot(), settings.keep)) await filesStore.remove(old.id, now)
    const status = { at: now, ok: true, text: `Gemaakt: ${summary.join(', ')}.` }
    setStatus(status)
    return status
  } catch (err) {
    const status = { at: now, ok: false, text: err instanceof Error ? err.message : String(err) }
    setStatus(status)
    return status
  }
}

/** When the newest automatic back-up in Bestanden was made, on any of your devices. */
export const lastAutoBackupAt = (): number | null => autoBackups(filesStore.getSnapshot())[0]?.addedAt ?? null

/**
 * Checks now and then whether an automatic back-up is due. With an account it waits for the first
 * round with Bestanden in your account, so it knows the back-ups your other devices made, and a
 * fresh device that has not received your data yet makes none. One tab does it (Web Locks).
 */
export function startAutoBackup(client: SupabaseClient | null): () => void {
  let stopped = false
  let busy = false
  let first: ReturnType<typeof setTimeout> | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let release: (() => void) | undefined
  const tick = async () => {
    if (busy || stopped) return
    busy = true
    try {
      await filesStore.ready
      const signedIn = client ? Boolean((await client.auth.getSession()).data.session) : false
      if (signedIn && filesSynced.at === 0) return
      const settings = autoBackupSettings()
      if (autoBackupDue(settings, lastAutoBackupAt(), Date.now())) await makeAutoBackup(settings)
    } finally {
      busy = false
    }
  }
  const run = () => {
    first = setTimeout(() => void tick(), FIRST_CHECK_MS)
    timer = setInterval(() => void tick(), CHECK_MS)
  }
  if (typeof navigator !== 'undefined' && navigator.locks) {
    void navigator.locks.request('nexus-autobackup', () => {
      if (stopped) return
      run()
      return new Promise<void>((resolve) => (release = resolve))
    })
  } else {
    run()
  }
  return () => {
    stopped = true
    clearTimeout(first)
    clearInterval(timer)
    release?.()
  }
}
