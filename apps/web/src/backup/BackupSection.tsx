import { useRef, useState } from 'react'
import { backupFileName, backupSummary, parseBackup, type NexusBackup } from '@nexus/core'
import { createBackup, downloadBackup, restoreBackup, type RestoreReport } from './backup'

const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

function reportText(r: RestoreReport): string {
  const parts = [
    r.notes && `${r.notes} notities`,
    r.life && `${r.life} deadlines, afspraken of projecten`,
    r.reminders && `${r.reminders} herinneringen`,
    r.files && `${r.files} bestanden`,
    r.flows && `${r.flows} flows`,
    r.focus && `${r.focus} focusrondes`,
  ].filter(Boolean)
  return parts.length ? `Teruggezet: ${parts.join(', ')}. Cijfers, Gewoontes en de andere apps zijn samengevoegd.` : 'Teruggezet. Alles uit de back-up stond hier al, of was hier nieuwer.'
}

/** Instellingen: everything in one file, and back again. */
export function BackupSection({ create = createBackup, restore = restoreBackup, download = downloadBackup }: { create?: typeof createBackup; restore?: typeof restoreBackup; download?: typeof downloadBackup }) {
  const [busy, setBusy] = useState(false)
  const [withFiles, setWithFiles] = useState(true)
  const [pending, setPending] = useState<NexusBackup | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await work()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const exportNow = () =>
    run(async () => {
      const b = await create({ withFiles })
      download(b, backupFileName(b.createdAt))
      setNotice(`Back-up gemaakt: ${backupSummary(b).join(', ') || 'nog niets om te bewaren'}. Bewaar het bestand op een veilige plek: wie het heeft, kan alles lezen.`)
    })

  const pick = (file: File | undefined) => {
    if (!file) return
    void run(async () => {
      const parsed = parseBackup(await file.text())
      if (!parsed.ok) throw new Error(parsed.error)
      setPending(parsed.value)
    })
  }

  return (
    <fieldset className="space-y-2 border-t border-nx-border pt-4 text-sm">
      <legend className="mb-2 text-sm font-semibold text-nx-muted">Back-up</legend>
      <p className="text-nx-muted">Bewaar al je gegevens in één bestand: notities, Agenda, herinneringen, bestanden, Cijfers, Gewoontes, Leerkaarten, Financiën, Examens, Dagboek, Profielen en flows. De sleutels van NEXUS Connect gaan er bewust niet in; koppel je apparaten na het terugzetten opnieuw als dat nodig is.</p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} className="accent-[var(--nx-accent)]" />
        Ook je bestanden (maakt de back-up groter)
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryButton} disabled={busy} onClick={() => void exportNow()}>
          Back-up maken
        </button>
        <button type="button" className={button} disabled={busy} onClick={() => input.current?.click()}>
          Back-up terugzetten…
        </button>
        <input ref={input} type="file" accept="application/json,.json" className="hidden" aria-label="Back-up kiezen" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
      </div>
      {pending && (
        <div className="space-y-2 rounded-lg border border-nx-border bg-nx-surface-2 p-3">
          <p>
            Back-up van {new Date(pending.createdAt).toLocaleString('nl-BE', { dateStyle: 'long', timeStyle: 'short' })}: {backupSummary(pending).join(', ') || 'leeg'}.
          </p>
          <p className="text-xs text-nx-muted">Terugzetten voegt samen: wat hier nieuwer is, blijft staan, en wat alleen hier staat gaat niet verloren. Je Profielen krijgen wel de instellingen uit de back-up.</p>
          <div className="flex gap-2">
            <button
              type="button"
              className={primaryButton}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const report = await restore(pending)
                  setPending(null)
                  setNotice(reportText(report))
                })
              }
            >
              Terugzetten
            </button>
            <button type="button" className={button} onClick={() => setPending(null)}>
              Annuleren
            </button>
          </div>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
    </fieldset>
  )
}
