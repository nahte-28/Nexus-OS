import type { SupabaseClient } from '@supabase/supabase-js'

export const MESSAGE_PUSH_MIGRATION = 'supabase/migrations/20261116090000_message_push.sql'

export interface MessagePushPrefs {
  dm: boolean
  team: boolean
}

/** A Dutch message; 'setup:<file>' asks for the SQL. */
export function messagePushError(error: { code?: string; message?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/message_push/i.test(text) && /42P01|PGRST205|could not find the table|does not exist/i.test(text)) return `setup:${MESSAGE_PUSH_MIGRATION}`
  return error?.message || 'Dat lukte niet. Probeer het opnieuw.'
}

/**
 * Which messages wake your phones (Berichten op je gsm en horloge). The database reads it when a
 * privébericht or teamchat message comes in; no row means both on.
 */
export class MessagePush {
  constructor(private client: SupabaseClient) {}

  async get(): Promise<MessagePushPrefs> {
    const { data, error } = await this.client.from('message_push').select('dm,team').maybeSingle()
    if (error) throw new Error(messagePushError(error))
    const row = data as { dm?: boolean; team?: boolean } | null
    return { dm: row?.dm ?? true, team: row?.team ?? true }
  }

  async set(prefs: MessagePushPrefs): Promise<void> {
    const { data } = await this.client.auth.getSession()
    const user = data.session?.user.id
    if (!user) throw new Error('Meld je aan in Account.')
    const { error } = await this.client.from('message_push').upsert({ user_id: user, dm: prefs.dm, team: prefs.team, updated_at: new Date().toISOString() })
    if (error) throw new Error(messagePushError(error))
  }
}
