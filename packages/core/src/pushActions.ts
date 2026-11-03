/**
 * Meldingsknoppen: which buttons a web-push notice gets on the phone (and the watch through
 * Chrome). Klaar ticks off a deadline, Later shows the same notice again in an hour (at most five
 * times). The database does it (supabase/migrations/20261103150000_push_actions.sql), with a random
 * token that only travels inside the encrypted notice. Pure logic.
 */
export type PushAction = 'done' | 'later'

export const PUSH_ACTION_LABELS: Record<PushAction, string> = { done: 'Klaar', later: 'Later' }

/** How the database marks a notice that came again after Later. */
export const LATER_MARK = '~later'

/** The buttons for a notice with [ref]; none for a test or a live message. */
export function pushActionsFor(ref: string): PushAction[] {
  const kind = /^([a-z-]+):/.exec(ref)?.[1]
  if (kind === 'deadline' && /^deadline:[0-9a-f-]{36}@/.test(ref)) return ['done', 'later']
  if (kind === 'deadline' || kind === 'appointment' || kind === 'reminder' || kind === 'habit' || kind === 'subscription') return ['later']
  return []
}

/** A random token for one notice (base64url, 32 characters). */
export function newActionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** SHA-256 of the token as hex: what the database keeps. */
export async function actionTokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
