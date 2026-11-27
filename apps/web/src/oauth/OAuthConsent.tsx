import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadSupabase } from '../sync/config'
import { savePendingConsent } from './pending'

type State =
  | { step: 'loading' }
  | { step: 'signin' }
  | { step: 'ask'; client: string; site: string; email: string }
  | { step: 'busy' }
  | { step: 'error'; message: string }

const button = 'rounded-md px-3 py-1.5 text-sm font-medium'

/** What an assistant can do in NEXUS once you allow it (packages/core/src/mcp.ts). */
const CAN = [
  'Je agenda bekijken: lessen, deadlines, afspraken en Google Agenda.',
  'Je notities zoeken en lezen.',
  'Notities, deadlines en afspraken toevoegen. De assistent vraagt jou eerst per actie.',
]

/**
 * The consent screen of the NEXUS MCP-server (/oauth/consent): an assistant such as Claude asks to
 * use your account, and you allow or refuse it. Supabase sends you here with ?authorization_id.
 */
export function OAuthConsent() {
  const [state, setState] = useState<State>({ step: 'loading' })
  const [client, setClient] = useState<SupabaseClient | null>(null)
  const id = new URLSearchParams(window.location.search).get('authorization_id')

  useEffect(() => {
    let gone = false
    void (async () => {
      if (!id) return setState({ step: 'error', message: 'Deze link mist het verzoek van de assistent. Start het koppelen opnieuw vanuit de assistent.' })
      const supabase = await loadSupabase()
      if (gone) return
      if (!supabase) return setState({ step: 'error', message: 'Deze NEXUS is niet met een account verbonden.' })
      setClient(supabase)
      const { data: session } = await supabase.auth.getSession()
      if (gone) return
      if (!session.session) return setState({ step: 'signin' })
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id)
      if (gone) return
      if (error || !data) return setState({ step: 'error', message: error?.message ?? 'Dit verzoek bestaat niet (meer). Start het koppelen opnieuw vanuit de assistent.' })
      // Already allowed before: straight back to the assistant.
      if (!('authorization_id' in data)) return window.location.assign(data.redirect_url)
      let site = data.redirect_uri
      try {
        site = new URL(data.redirect_uri).host
      } catch {
        // Show the address as it is.
      }
      setState({ step: 'ask', client: data.client.name || 'Een assistent', site, email: data.user.email })
    })()
    return () => {
      gone = true
    }
  }, [id])

  const decide = async (allow: boolean) => {
    if (!client || !id) return
    setState({ step: 'busy' })
    const { data, error } = allow
      ? await client.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await client.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true })
    if (error || !data) return setState({ step: 'error', message: error?.message ?? 'Dat lukte niet. Probeer het opnieuw vanuit de assistent.' })
    window.location.assign(data.redirect_url)
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-nx-bg p-4 text-nx-text">
      <section aria-labelledby="consent-title" className="w-full max-w-md space-y-4 rounded-xl border border-nx-border bg-nx-surface p-5 text-sm leading-relaxed">
        <h1 id="consent-title" className="text-lg font-semibold">
          {state.step === 'ask' ? `${state.client} wil NEXUS gebruiken` : 'Assistent koppelen aan NEXUS'}
        </h1>
        <div role="status" aria-live="polite">
          {state.step === 'loading' && <p className="text-nx-muted">Verzoek ophalen…</p>}
          {state.step === 'busy' && <p className="text-nx-muted">Even geduld…</p>}
          {state.step === 'error' && <p>{state.message}</p>}
        </div>
        {state.step === 'signin' && (
          <>
            <p>Log eerst in met je NEXUS-account. Daarna kom je vanzelf terug op dit scherm.</p>
            <button
              type="button"
              className={`${button} bg-nx-accent text-nx-accent-text`}
              onClick={() => {
                if (id) savePendingConsent(id)
                window.location.assign('/')
              }}
            >
              Inloggen in NEXUS
            </button>
          </>
        )}
        {state.step === 'ask' && (
          <>
            <p>
              Ingelogd als <strong>{state.email}</strong>. Na je akkoord kan {state.client} dit met jouw account:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {CAN.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p className="text-xs text-nx-muted">
              Je wordt daarna teruggestuurd naar <span className="font-medium text-nx-text">{state.site}</span>. Je trekt de toegang weer in via NEXUS AI › Wat NEXUS AI mag zien › Gekoppelde assistenten.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={`${button} bg-nx-accent text-nx-accent-text`} onClick={() => void decide(true)}>
                Toestaan
              </button>
              <button type="button" className={`${button} border border-nx-border hover:bg-nx-surface-2`} onClick={() => void decide(false)}>
                Weigeren
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
