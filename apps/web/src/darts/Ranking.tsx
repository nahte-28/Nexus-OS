import { dartsRanking } from '@nexus/core'
import { useDarts } from './store'

/** Darts › Online: the standing of your finished online matches, you and each friend you played. */
export function Ranking() {
  const { matches, settings } = useDarts()
  if (!settings.me.trim()) return <p className="text-sm text-nx-muted">Vul je eigen naam in bij Instellingen, dan houdt NEXUS een ranglijst bij van je online matchen.</p>
  const rows = dartsRanking(matches, settings.me)
  return (
    <section aria-label="Ranglijst" className="space-y-1">
      <h3 className="font-medium">Ranglijst</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-nx-muted">Nog geen afgewerkte online matchen. Na je eerste match tegen een vriend staan jullie hier.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-nx-muted">
                <tr>
                  <th className="py-1 pr-2 font-normal">#</th>
                  <th className="py-1 pr-2 font-normal">Speler</th>
                  <th className="py-1 pr-2 text-right font-normal">Gewonnen</th>
                  <th className="py-1 pr-2 text-right font-normal">Gem.</th>
                  <th className="py-1 text-right font-normal">Hoogste finish</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.me}-${r.name}`} className={`border-t border-nx-border ${r.me ? 'font-medium' : ''}`}>
                    <td className="py-1 pr-2">{i + 1}</td>
                    <td className="py-1 pr-2">
                      {r.me ? `${r.name} (jij)` : r.name}
                      {r.head && <span className="block text-xs font-normal text-nx-muted">Onderling {r.head.mine}–{r.head.theirs}</span>}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {r.won} van {r.matches}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">{r.average.toFixed(1)}</td>
                    <td className="py-1 text-right tabular-nums">{r.highestCheckout || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-nx-muted">Gerangschikt op het deel van de matchen dat je won, dan op gemiddelde. Van een vriend tellen alleen de matchen tegen jou.</p>
        </>
      )}
    </section>
  )
}
