import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Which Supabase project this build talks to, without the Supabase library itself: that one is
 * loaded with [loadSupabase] after the first screen, so opening NEXUS does not wait for it.
 */

/** Trims whitespace and quotes that easily slip in when pasting into a dashboard. */
export function cleanEnv(raw: string | undefined): string | undefined {
  const value = raw?.trim().replace(/^["']|["']$/g, '').trim()
  return value || undefined
}

/** Accepts the project URL as copied from anywhere in the dashboard, e.g. with a trailing /rest/v1/. */
export function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
  const cleaned = cleanEnv(raw)
  if (!cleaned) return undefined
  return cleaned.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '')
}

/** The project address this build talks to, e.g. for a link to its SQL Editor. */
export const supabaseUrl: string | undefined = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined)
export const supabaseKey: string | undefined = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

/** Names of the settings this build was made without, for the setup hint in the Account app. */
export const missingSupabaseEnv: string[] = [
  ...(supabaseUrl ? [] : ['VITE_SUPABASE_URL']),
  ...(supabaseKey ? [] : ['VITE_SUPABASE_ANON_KEY']),
]

/** False when the env vars are missing: NEXUS then simply stays local-only. */
export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey)

/** The one shared client, or null when not configured. Loads the library the first time. */
export function loadSupabase(): Promise<SupabaseClient | null> {
  return supabaseConfigured ? import('./supabase').then((m) => m.supabase) : Promise.resolve(null)
}
