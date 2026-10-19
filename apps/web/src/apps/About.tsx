export function About() {
  return (
    <div className="space-y-3 p-4 text-sm leading-relaxed">
      <h2 className="text-lg font-semibold">NEXUS OS v0.4</h2>
      <p>
        Een modulair, persoonlijk ecosysteem bovenop je bestaande besturingssystemen. Deze versie bevat de webdesktop,
        een mobiele weergave, notities die offline werken en synchroniseren, de thema's Focus en Pulse, en NEXUS
        Connect: gekoppelde apparaten en end-to-end versleutelde meldingen van je gsm.
      </p>
      <p className="text-nx-muted">
        Volgende stappen: Windows-app via Tauri (v0.5) en meldingen op je horloge (v0.6).
      </p>
    </div>
  )
}
