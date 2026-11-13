import { useCallback, useEffect, useState } from 'react'
import { deviceSummary, sortAdminTeams, type AdminOverview } from '@nexus/core'
import { supabase } from '../sync/supabase'
import { Admin as AdminApi } from '../admin/admin'

const defaultApi = supabase ? new AdminApi(supabase) : null
const when = (t: number) => new Date(t).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'

function Stat({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return (
    <div className="rounded-lg border border-nx-border p-3">
      <p className="text-xs text-nx-muted">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {detail && <p className="text-xs text-nx-muted">{detail}</p>}
    </div>
  )
}

/** Beheer: for the owner of this NEXUS, how many people use it, who is online and what goes wrong. */
export function Admin({ api = defaultApi }: { api?: AdminApi | null }) {
  const [data, setData] = useState<AdminOverview | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!api) return
    setBusy(true)
    try {
      setData(await api.overview())
      setProblem(null)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [api])

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 60_000)
    return () => clearInterval(t)
  }, [refresh])

  if (!api) return <p className="p-4 text-sm text-nx-muted">Beheer werkt met een account. Deze versie van NEXUS heeft geen verbinding met Supabase.</p>

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-nx-muted">
          Alleen tellingen en namen: wat mensen in notities, berichten of bestanden schrijven, zie je hier nooit. Wie Onzichtbaar koos, telt niet mee als online.
        </p>
        <button type="button" className={small} disabled={busy} onClick={() => void refresh()}>
          Vernieuwen
        </button>
      </div>
      {problem?.startsWith('setup:') ? (
        <p role="alert" className="rounded-md border border-amber-500/40 p-2 text-amber-700 dark:text-amber-300">
          Beheer heeft nog een stap in de database nodig: voer eenmalig <code>{problem.slice(6)}</code> uit in de SQL Editor van Supabase (of via Account › Database-check).
        </p>
      ) : (
        problem && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">{problem}</p>
      )}
      {!data && !problem && <p className="text-nx-muted">Laden…</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Nu online" value={data.online.length} />
            <Stat label="Accounts" value={data.accounts.total} detail={`${data.accounts.new7d} nieuw deze week`} />
            <Stat label="Actief vandaag" value={data.accounts.active24h} detail={`${data.accounts.active7d} deze week`} />
            <Stat label="Foutmeldingen" value={data.errors.count7d} detail="deze week" />
          </div>

          <section className="space-y-2">
            <h3 className="font-medium">Nu online</h3>
            {data.online.length === 0 ? (
              <p className="text-nx-muted">Niemand heeft NEXUS nu open.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {data.online.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-nx-border px-2.5 py-1 text-xs">
                    <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${p.state === 'busy' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    {p.name}
                    {p.state === 'busy' && <span className="text-nx-muted">(bezet)</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-nx-muted">
              Aangemeld deze week: {data.accounts.signedIn7d}. Toestellen gebruikt in de laatste 30 dagen: {deviceSummary(data.devices)}.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium">Samen</h3>
            <ul className="grid gap-1 text-xs sm:grid-cols-2">
              <li>Vriendschappen: {data.activity.friendships} (en {data.activity.requests} open verzoeken)</li>
              <li>Teamchatberichten deze week: {data.activity.teamMessages7d}</li>
              <li>Opmerkingen bij taken deze week: {data.activity.comments7d}</li>
              <li>Privéberichten deze week: {data.activity.directMessages7d} (versleuteld, alleen geteld)</li>
            </ul>
            {data.teams.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Teams</caption>
                  <thead className="text-nx-muted">
                    <tr>
                      <th className="py-1 pr-2 font-normal">Team</th>
                      <th className="py-1 pr-2 font-normal">Leden</th>
                      <th className="py-1 pr-2 font-normal">Online</th>
                      <th className="py-1 font-normal">Chat deze week</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortAdminTeams(data.teams).map((t, i) => (
                      <tr key={`${t.name}-${i}`} className="border-t border-nx-border">
                        <td className="py-1 pr-2">{t.name}</td>
                        <td className="py-1 pr-2">{t.members}</td>
                        <td className="py-1 pr-2">{t.online}</td>
                        <td className="py-1">{t.messages7d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="font-medium">Laatste foutmeldingen</h3>
            {data.errors.latest.length === 0 ? (
              <p className="text-nx-muted">Nog niemand meldde een probleem.</p>
            ) : (
              <ul className="space-y-1">
                {data.errors.latest.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="rounded-lg border border-nx-border px-3 py-2">
                    <p className="text-xs text-nx-muted">
                      {when(e.at)} · {e.name} · {e.app} · versie {e.version}
                    </p>
                    <p className="break-words">{e.message}</p>
                    {e.note && <p className="break-words text-xs text-nx-muted">“{e.note}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="text-xs text-nx-muted">Bijgewerkt om {new Date(data.at).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}.</p>
        </>
      )}
    </div>
  )
}
