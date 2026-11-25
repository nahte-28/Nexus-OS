import { parseAdminOverview, type AdminOverview } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { setAdmin } from './flag'
import { friendError } from '../friends/friends'

export const ADMIN_MIGRATION = 'supabase/migrations/20261113240000_admin.sql'

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

export { setAdmin, useIsAdmin } from './flag'

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
