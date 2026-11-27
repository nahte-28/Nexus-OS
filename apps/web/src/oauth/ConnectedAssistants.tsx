import { useCallback, useEffect, useState } from 'react'
import type { OAuthGrant, SupabaseClient } from '@supabase/supabase-js'
import { loadSupabase } from '../sync/config'

const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'

/** Assistants you allowed to use NEXUS (MCP-server), with a button to take the access back. */
export function ConnectedAssistants() {
  const [client, setClient] = useState<SupabaseClient | null>(null)
  const [grants, setGrants] = useState<OAuthGrant[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async (supabase: SupabaseClient) => {
    const { data: session } = await supabase.auth.getSession()
    if (!session.session) return setGrants([])
    const { data, error } = await supabase.auth.oauth.listGrants()
    // Without the OAuth server on in Supabase there is nothing to list.
    if (error) return setGrants([])
    setGrants(data ?? [])
  }, [])

  useEffect(() => {
    void loadSupabase().then((supabase) => {
      setClient(supabase)
      if (supabase) void load(supabase)
      else setGrants([])
    })
  }, [load])

  const revoke = async (grant: OAuthGrant) => {
    if (!client) return
    setBusy(grant.client.id)
    const { error } = await client.auth.oauth.revokeGrant({ clientId: grant.client.id })
    setBusy(null)
    if (error) return setProblem(`Intrekken lukte niet: ${error.message}`)
    setProblem(null)
    await load(client)
  }

  return (
    <section className="space-y-2">
      <h3 className="font-medium">Gekoppelde assistenten</h3>
      <p className="text-xs text-nx-muted">
        Assistenten zoals Claude die je via de NEXUS MCP-server toegang gaf tot je agenda en notities. Intrekken meldt ze meteen af.
      </p>
      {grants === null ? (
        <p className="text-nx-muted">Laden…</p>
      ) : grants.length === 0 ? (
        <p className="text-nx-muted">Geen. Koppel een assistent met het adres {window.location.origin}/api/mcp.</p>
      ) : (
        <ul className="space-y-1">
          {grants.map((g) => (
            <li key={g.client.id} className="flex items-center justify-between gap-2">
              <span>
                {g.client.name || 'Assistent'}
                <span className="block text-xs text-nx-muted">Sinds {new Date(g.granted_at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </span>
              <button type="button" className={small} disabled={busy === g.client.id} aria-label={`Toegang van ${g.client.name || 'assistent'} intrekken`} onClick={() => void revoke(g)}>
                Intrekken
              </button>
            </li>
          ))}
        </ul>
      )}
      {problem && <p role="status">{problem}</p>}
    </section>
  )
}
