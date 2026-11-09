import { useEffect, useState } from 'react'
import { CHANGELOG } from '../about/changelog'
import { markChangelogSeen } from '../about/seen'

/** Major and minor only, e.g. "1.0" for 1.0.3. */
const shortVersion = __APP_VERSION__.split('.').slice(0, 2).join('.')

const SHOWN = 5

function day(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function About() {
  const [all, setAll] = useState(false)
  // Reading the list here counts as having seen what is new.
  useEffect(() => markChangelogSeen(), [])
  const entries = all ? CHANGELOG : CHANGELOG.slice(0, SHOWN)
  return (
    <div className="space-y-3 p-4 text-sm leading-relaxed">
      <h2 className="text-lg font-semibold">NEXUS OS v{shortVersion}</h2>
      <p>
        Een modulair, persoonlijk ecosysteem bovenop je bestaande besturingssystemen: een webdesktop en mobiele
        weergave, notities die offline werken en synchroniseren, NEXUS Connect (end-to-end versleutelde meldingen
        tussen je gsm, horloge en pc), een Windows-app met eigen browser, een horloge-app, NEXUS AI met acties die
        eerst je toestemming vragen, profielen, Flow Studio en de apps voor school, werk, geld, sport en je dag.
      </p>
      <p className="text-nx-muted">Versie {__APP_VERSION__}</p>
      <section aria-labelledby="about-new" className="space-y-2">
        <h3 id="about-new" className="font-semibold">
          Wat is er nieuw
        </h3>
        <ol className="space-y-3">
          {entries.map((e) => (
            <li key={`${e.date}-${e.title}`}>
              <p>
                <span className="font-medium">{e.title}</span> <span className="text-nx-muted">· {day(e.date)}</span>
              </p>
              <ul className="ml-4 list-disc text-nx-muted">
                {e.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        {CHANGELOG.length > SHOWN && (
          <button type="button" className="text-nx-accent underline" onClick={() => setAll((v) => !v)}>
            {all ? 'Minder tonen' : `Alles tonen (${CHANGELOG.length})`}
          </button>
        )}
      </section>
    </div>
  )
}
