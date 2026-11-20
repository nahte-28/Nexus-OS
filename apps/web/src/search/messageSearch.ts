import { useEffect, useRef, useState } from 'react'
import { messageResults, normalize, type SearchableMessage, type SearchResult } from '@nexus/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadSupabase } from '../sync/config'

/** Where messages come from; the default reads Supabase and opens privéberichten on this device. */
export interface MessageSource {
  /** Teamchat messages with this word in them, from the teams you are in. */
  team(term: string): Promise<SearchableMessage[]>
  /** Your recent privéberichten, opened on this device: they never leave it readable. */
  dms(): Promise<SearchableMessage[]>
}

const likeEscape = (term: string) => term.replace(/[\\%_]/g, (c) => `\\${c}`)

async function names(client: SupabaseClient, table: 'friend_profiles' | 'study_groups', ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = table === 'study_groups'
    ? await client.from('study_groups').select('id,name').in('id', ids)
    : await client.from('friend_profiles').select('user_id,display_name').in('user_id', ids)
  return new Map(((data ?? []) as Array<{ id?: string; user_id?: string; name?: string; display_name?: string }>).map((r) => [(r.id ?? r.user_id)!, (r.name ?? r.display_name)!]))
}

export function supabaseMessageSource(): MessageSource {
  return {
    async team(term) {
      const client = await loadSupabase()
      if (!client) return []
      const { data, error } = await client
        .from('team_messages')
        .select('id,group_id,user_id,body,created_at')
        .ilike('body', `%${likeEscape(term)}%`)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error || !data) return []
      const rows = data as Array<{ id: string; group_id: string; user_id: string; body: string; created_at: string }>
      const groups = [...new Set(rows.map((r) => r.group_id))]
      const [teams, members, session] = await Promise.all([
        names(client, 'study_groups', groups),
        groups.length ? client.from('study_group_members').select('group_id,user_id,display_name').in('group_id', groups) : Promise.resolve({ data: [] }),
        client.auth.getSession(),
      ])
      const me = session.data.session?.user.id
      const who = new Map(((members.data ?? []) as Array<{ group_id: string; user_id: string; display_name: string }>).map((m) => [`${m.group_id}:${m.user_id}`, m.display_name]))
      return rows.map((r) => ({
        id: r.id,
        kind: 'team',
        where: teams.get(r.group_id) ?? 'Team',
        open: `chat:${r.group_id}`,
        from: r.user_id === me ? 'jij' : (who.get(`${r.group_id}:${r.user_id}`) ?? 'Oud lid'),
        text: r.body,
        at: Date.parse(r.created_at),
      }))
    },
    async dms() {
      const client = await loadSupabase()
      if (!client) return []
      const [{ DirectMessages }, { defaultEngine }, session] = await Promise.all([import('../friends/dm'), import('../connect/ConnectContext'), client.auth.getSession()])
      const me = session.data.session?.user.id
      if (!me) return []
      const all = await new DirectMessages(client, defaultEngine).recent(300)
      const friends = await names(client, 'friend_profiles', [...new Set(all.map((m) => (m.sender === me ? m.recipient : m.sender)))])
      return all
        .filter((m) => m.text)
        .map((m) => {
          const friend = m.sender === me ? m.recipient : m.sender
          const name = friends.get(friend) ?? 'Vriend'
          return { id: m.id, kind: 'dm' as const, where: name, open: `dm:${friend}`, from: m.sender === me ? 'jij' : name, text: m.text ?? '', at: m.createdAt }
        })
    },
  }
}

const defaultSource = supabaseMessageSource()

/**
 * Berichten in Zoeken: teamchat and privéberichten that match, a moment after you stop typing.
 * Privéberichten are fetched once per search window and searched here, on this device.
 */
export function useMessageSearch(query: string, on: { team: boolean; dm: boolean }, source: MessageSource = defaultSource): SearchResult[] {
  const [found, setFound] = useState<SearchResult[]>([])
  const dms = useRef<Promise<SearchableMessage[]> | null>(null)
  useEffect(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean)
    const longest = query.trim().split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? ''
    if ((!on.team && !on.dm) || longest.length < 2 || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      setFound((f) => (f.length ? [] : f))
      return
    }
    let stale = false
    const timer = setTimeout(async () => {
      if (on.dm && !dms.current) dms.current = source.dms().catch(() => [])
      const [team, mine] = await Promise.all([on.team ? source.team(longest).catch(() => []) : [], on.dm && dms.current ? dms.current : []])
      if (!stale && terms.length > 0) setFound(messageResults(query, [...team, ...mine]))
    }, 300)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [query, on.team, on.dm, source])
  return found
}
