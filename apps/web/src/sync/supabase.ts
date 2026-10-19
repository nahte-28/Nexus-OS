import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { toNote, type Note, type PullResult, type RemoteStore } from '@nexus/core'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Null until the Supabase env vars are set; the app then simply stays local-only. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

const PAGE_SIZE = 500
/** Re-read a little before the cursor: writes committing late can carry an older synced_at. */
const OVERLAP_MS = 30_000

interface NoteRow {
  id: string
  title: string
  body: string
  updated_at: number
  deleted_at: number | null
  synced_at: string
}

function fromRow(row: NoteRow): Note | null {
  return toNote({
    id: row.id,
    title: row.title,
    body: row.body,
    updatedAt: Number(row.updated_at),
    deletedAt: row.deleted_at === null ? null : Number(row.deleted_at),
  })
}

export function createNotesRemote(client: SupabaseClient): RemoteStore<Note> {
  return {
    async push(notes) {
      const rows = notes.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        updated_at: n.updatedAt,
        deleted_at: n.deletedAt,
      }))
      const { error } = await client.from('notes').upsert(rows, { onConflict: 'id' })
      if (error) throw error
    },

    async pull(cursor): Promise<PullResult<Note>> {
      const records: Note[] = []
      let since = cursor ? new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString() : null
      let latest = cursor
      for (;;) {
        let query = client
          .from('notes')
          .select('id,title,body,updated_at,deleted_at,synced_at')
          .order('synced_at', { ascending: true })
          .limit(PAGE_SIZE)
        if (since) query = query.gt('synced_at', since)
        const { data, error } = await query
        if (error) throw error
        const rows = (data ?? []) as NoteRow[]
        for (const row of rows) {
          const note = fromRow(row)
          if (note) records.push(note)
        }
        if (rows.length > 0) {
          const last = rows[rows.length - 1].synced_at
          if (!latest || last > latest) latest = last
          since = last
        }
        if (rows.length < PAGE_SIZE) break
      }
      return { records, cursor: latest }
    },
  }
}
