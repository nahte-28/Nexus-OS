/** Major and minor only, e.g. "1.0" for 1.0.3. */
const shortVersion = __APP_VERSION__.split('.').slice(0, 2).join('.')

export function About() {
  return (
    <div className="space-y-3 p-4 text-sm leading-relaxed">
      <h2 className="text-lg font-semibold">NEXUS OS v{shortVersion}</h2>
      <p>
        Een modulair, persoonlijk ecosysteem bovenop je bestaande besturingssystemen: een webdesktop en mobiele
        weergave, notities die offline werken en synchroniseren, NEXUS Connect (end-to-end versleutelde meldingen
        tussen je gsm, horloge en pc), een Windows-app, een horloge-app, NEXUS AI met acties die eerst je
        toestemming vragen, profielen, Flow Studio en de apps voor school, geld en je dag.
      </p>
      <p className="text-nx-muted">Versie {__APP_VERSION__}</p>
    </div>
  )
}
