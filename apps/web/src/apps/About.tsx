export function About() {
  return (
    <div className="space-y-3 p-4 text-sm leading-relaxed">
      <h2 className="text-lg font-semibold">NEXUS OS v0.3</h2>
      <p>
        Een modulair, persoonlijk ecosysteem bovenop je bestaande besturingssystemen. Deze versie bevat de webdesktop,
        een mobiele weergave, notities die offline werken en synchroniseren, en de thema's Focus en Pulse.
      </p>
      <p className="text-nx-muted">
        Volgende stappen: Device Center en Android companion (v0.4), Windows-app via
        Tauri (v0.5).
      </p>
    </div>
  )
}
