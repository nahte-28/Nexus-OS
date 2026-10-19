export function About() {
  return (
    <div className="space-y-3 p-4 text-sm leading-relaxed">
      <h2 className="text-lg font-semibold">NEXUS OS v0.2</h2>
      <p>
        Een modulair, persoonlijk ecosysteem bovenop je bestaande besturingssystemen. Deze versie bevat de webdesktop,
        een mobiele weergave, notities en de thema's Focus en Pulse.
      </p>
      <p className="text-nx-muted">
        Volgende stappen: accounts en synchronisatie (v0.3), Device Center en Android companion (v0.4), Windows-app via
        Tauri (v0.5).
      </p>
    </div>
  )
}
