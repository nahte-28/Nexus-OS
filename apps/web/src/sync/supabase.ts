import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseKey, supabaseUrl } from './config'

export { missingSupabaseEnv, normalizeSupabaseUrl, supabaseUrl } from './config'

/** Null until the Supabase env vars are set; the app then simply stays local-only. */
export const supabase: SupabaseClient | null = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

export { createNotesRemote } from './notesRemote'
