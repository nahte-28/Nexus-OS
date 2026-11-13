import { useSyncExternalStore } from 'react'
import { parseAdminOverview, type AdminOverview } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readStorage, writeStorage } from '../state/storage'
import { friendError } from '../friends/friends'

export const ADMIN_MIGRATION = 'supabase/migrations/20261113240000_admin.sql'
const KEY = 'nexus.admin'

/** A Dutch message for Beheer; 'setup:<file>' asks for the SQL. */
export function adminError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/admin_overview|is_nexus_admin/i.test(text) && /42883|PGRST202|could not find the function|does not exist/i.test(text)) return `setup:${ADMIN_MIGRATION}`
  if (/not an admin|42501/i.test(text)) return 'Alleen een beheerder van NEXUS ziet dit overzicht.'
  return friendError(error)
}

export class Admin {
  constructor(private client: SupabaseClient) {}

  /** False as well when the SQL step is missing: then nobody is an admin yet. */
  async isAdmin(): Promise<boolean> {
    const { data, error } = await this.client.rpc('is_nexus_admin')
    return !error && data === true
  }

  async overview(): Promise<AdminOverview> {
    const { data, error } = await this.client.rpc('admin_overview')
    if (error) throw new Error(adminError(error))
    return parseAdminOverview(data)
  }
}

// Whether this account is an admin, remembered so Beheer is in the sidebar right after a start.
let admin = readStorage(KEY) === 'on'
const listeners = new Set<() => void>()
export function setAdmin(on: boolean): void {
  if (on === admin) return
  admin = on
  writeStorage(KEY, on ? 'on' : 'off')
  listeners.forEach((l) => l())
}
export function useIsAdmin(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => admin,
  )
}

/** Asks the database once per sign-in whether you are an admin; signed out you never are. */
export function startAdminCheck(client: SupabaseClient | null): () => void {
  if (!client) return () => {}
  const api = new Admin(client)
  let me: string | null = null
  const check = (userId: string | null) => {
    me = userId
    if (!userId) return setAdmin(false)
    void api.isAdmin().then((on) => me === userId && setAdmin(on), () => {})
  }
  void client.auth.getSession().then(({ data }) => check(data.session?.user.id ?? null))
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    if ((session?.user.id ?? null) !== me) check(session?.user.id ?? null)
  })
  return () => data.subscription.unsubscribe()
}
