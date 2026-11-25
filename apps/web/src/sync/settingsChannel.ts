import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * One realtime channel on user_settings for every synced document (Cijfers, Gewoontes, Doelen,
 * profiles, ...). A change on another device wakes only the document whose key changed, so it
 * shows here within seconds instead of at the next 5-minute poll. Rows are per user (RLS), so the
 * channel only ever sees this account's documents.
 */

type Channel = ReturnType<SupabaseClient['channel']>

interface Hub {
  channel: Channel
  handlers: Map<string, Set<() => void>>
}

const hubs = new WeakMap<SupabaseClient, Hub>()

/** The document key in a realtime payload; null when it is not there (a delete without old values). */
export function changedSettingKey(payload: unknown): string | null {
  const row = (payload as { new?: { key?: unknown }; old?: { key?: unknown } } | null) ?? {}
  const key = row.new?.key ?? row.old?.key
  return typeof key === 'string' && key.length > 0 ? key : null
}

function notify(hub: Hub, payload: unknown): void {
  const key = changedSettingKey(payload)
  const targets = key ? [hub.handlers.get(key)] : [...hub.handlers.values()]
  for (const set of targets) set?.forEach((fn) => fn())
}

/** Calls [onChange] when the user_settings row [key] changes on another device. */
export function watchSetting(client: SupabaseClient, key: string, onChange: () => void): () => void {
  let hub = hubs.get(client)
  if (!hub) {
    const handlers = new Map<string, Set<() => void>>()
    const created: Hub = { handlers, channel: null as unknown as Channel }
    created.channel = client
      .channel('settings-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_settings' }, (payload: unknown) => notify(created, payload))
      .subscribe()
    hub = created
    hubs.set(client, hub)
  }
  const set = hub.handlers.get(key) ?? new Set()
  set.add(onChange)
  hub.handlers.set(key, set)
  const current = hub
  return () => {
    set.delete(onChange)
    if (set.size === 0) current.handlers.delete(key)
    if (current.handlers.size === 0 && hubs.get(client) === current) {
      hubs.delete(client)
      void client.removeChannel(current.channel)
    }
  }
}
