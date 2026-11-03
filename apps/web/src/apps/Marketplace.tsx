import { useState } from 'react'
import { isInstalled, MARKET_KINDS, marketView, PERMISSION_INFO, type MarketItem, type MarketKind } from '@nexus/core'
import { useFeature } from '../features/store'
import { addMarketItem, removeMarketItem, useMarket } from '../marketplace/store'
import { useProfiles } from '../profiles/store'
import { openApp } from '../shell/openApp'
import { ACCENTS } from '../theme/accents'

const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'
const primary = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'
const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'
const ACTION: Record<MarketKind, string> = { widget: 'Installeren', theme: 'Toepassen', flow: 'Toevoegen', capture: 'Toevoegen' }

/** Marketplace: extras made by NEXUS itself; a widget shows its permissions before it is installed. */
export function Marketplace() {
  const [kind, setKind] = useState<MarketKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [asking, setAsking] = useState<MarketItem | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const market = useMarket()
  const { active } = useProfiles()
  const devHub = useFeature('devHub')
  const items = marketView(kind, query)

  const add = (item: MarketItem) => {
    setMessage(null)
    try {
      setMessage(addMarketItem(item))
    } catch (err) {
      setMessage(`Niet gelukt: ${err instanceof Error ? err.message : String(err)}`)
    }
    setAsking(null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div role="tablist" aria-label="Soort" className="flex gap-1 overflow-x-auto border-b border-nx-border px-3 py-2">
        {[{ id: 'all' as const, label: 'Alles' }, ...MARKET_KINDS].map((k) => (
          <button key={k.id} type="button" role="tab" aria-selected={kind === k.id} onClick={() => setKind(k.id)} className={`shrink-0 rounded-md px-3 py-1 ${kind === k.id ? 'bg-nx-surface-2 font-medium' : 'hover:bg-nx-surface-2'}`}>
            {k.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <p className="text-nx-muted">Alles hier is gemaakt door NEXUS en zit al in de app: er wordt niets van anderen gedownload. Widgets draaien afgeschermd, met alleen de permissies die je goedkeurt.</p>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoeken" aria-label="Zoeken in de Marketplace" className={`${field} max-w-72`} />
        {message && (
          <p role="status" className="rounded-md border border-nx-border p-2">
            {message}
          </p>
        )}

        {asking && asking.kind === 'widget' && (
          <section role="dialog" aria-modal="false" aria-labelledby="market-perm" className="space-y-2 rounded-lg border border-nx-accent p-3">
            <h3 id="market-perm" className="font-medium">
              {asking.title} installeren?
            </h3>
            <p className="text-xs text-nx-muted">Deze widget mag:</p>
            <ul className="list-disc pl-5">
              {asking.manifest.permissions.map((p) => (
                <li key={p}>
                  {PERMISSION_INFO[p].title} <span className="text-xs text-nx-muted">({PERMISSION_INFO[p].detail})</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-nx-muted">Geen internet, geen opslag en niets anders van NEXUS. Je haalt hem weg met Verwijderen, hier of in Sentinel.</p>
            <div className="flex gap-2">
              <button type="button" className={primary} onClick={() => add(asking)}>
                Toestaan en installeren
              </button>
              <button type="button" className={small} onClick={() => setAsking(null)}>
                Annuleren
              </button>
            </div>
          </section>
        )}

        {items.length === 0 ? (
          <p className="text-nx-muted">Niets gevonden.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Catalogus">
            {items.map((item) => {
              const installed = isInstalled(market, item.id)
              const applied = item.kind === 'theme' && active.theme === item.theme && active.accent === item.accent
              return (
                <li key={item.id} className="flex flex-col gap-2 rounded-lg border border-nx-border p-3">
                  <div className="flex items-start gap-2">
                    {item.kind === 'theme' && <span aria-hidden className="mt-1 size-5 shrink-0 rounded-full border-4" style={{ background: ACCENTS[item.accent][item.theme][0], borderColor: item.theme === 'pulse' ? '#0b1020' : '#f1f5f9' }} />}
                    <div className="min-w-0">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs text-nx-muted">
                        {MARKET_KINDS.find((k) => k.id === item.kind)?.label} · door {item.by} · versie {item.version}
                      </p>
                    </div>
                  </div>
                  <p className="text-nx-muted">{item.description}</p>
                  {item.kind === 'widget' && (
                    <p className="text-xs text-nx-muted">Mag: {item.manifest.permissions.map((p) => PERMISSION_INFO[p].title.toLowerCase()).join(', ')}</p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2">
                    {item.kind === 'theme' ? (
                      <button type="button" className={small} disabled={applied} onClick={() => add(item)}>
                        {applied ? `Actief in ${active.name}` : `Toepassen op ${active.name}`}
                      </button>
                    ) : installed && item.kind === 'widget' ? (
                      <button type="button" className={small} onClick={() => (removeMarketItem(item), setMessage(`${item.title} is verwijderd.`))}>
                        Verwijderen
                      </button>
                    ) : (
                      <button type="button" className={small} onClick={() => (item.kind === 'widget' ? setAsking(item) : add(item))}>
                        {installed ? 'Nog eens toevoegen' : ACTION[item.kind]}
                      </button>
                    )}
                    {installed && item.kind === 'flow' && (
                      <button type="button" className={small} onClick={() => openApp('flows')}>
                        Flow Studio openen
                      </button>
                    )}
                    {installed && item.kind === 'widget' && !devHub && <span className="text-xs text-nx-muted">Staat op je dashboard.</span>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
