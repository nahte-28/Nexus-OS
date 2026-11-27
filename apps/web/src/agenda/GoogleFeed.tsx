import { useEffect, useState } from 'react'
import type { AgendaFeedOptions } from '@nexus/core'
import { agendaFeed, feedFile, publicFeedUrl, useAgendaFeed, type AgendaFeed } from './feed'

const field = 'min-w-0 flex-1 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 font-mono text-xs outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

function Problem({ text }: { text: string }) {
  if (text.startsWith('setup:')) {
    return (
      <p role="alert" className="rounded-lg border border-nx-border bg-nx-surface-2 p-3 text-sm">
        Hiervoor is nog één SQL-stap nodig: <code className="font-mono text-xs">{text.slice(6)}</code>. Kijk in Account › Database-check.
      </p>
    )
  }
  return (
    <p role="alert" className="text-sm text-nx-danger">
      {text}
    </p>
  )
}

function download(options: AgendaFeedOptions): void {
  const url = URL.createObjectURL(feedFile(options))
  const a = document.createElement('a')
  a.href = url
  a.download = 'nexus-agenda.ics'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Agenda in Google: a secret link Google Agenda follows, with the lessons (and if you like the
 * appointments and deadlines) from NEXUS that are not in your Google Agenda yet.
 */
export function GoogleFeed({ feed = agendaFeed }: { feed?: AgendaFeed }) {
  const { loaded, feed: info, problem } = useAgendaFeed(feed)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [options, setOptions] = useState<AgendaFeedOptions>(info?.options ?? { appointments: true, deadlines: false })
  useEffect(() => {
    if (!loaded) void feed.load()
  }, [feed, loaded])
  useEffect(() => {
    if (info) setOptions(info.options)
  }, [info])

  const act = async (work: () => Promise<string | null>, done: string) => {
    setBusy(true)
    setMessage(null)
    setError(null)
    const failed = await work()
    setBusy(false)
    if (failed) setError(failed)
    else setMessage(done)
  }
  const link = info ? publicFeedUrl(info.token) : null
  const change = (next: AgendaFeedOptions) => {
    setOptions(next)
    if (info) void act(() => feed.setOptions(next), 'Opgeslagen. Google neemt het over bij de volgende keer dat het kijkt.')
  }

  return (
    <section aria-label="In Google Agenda zetten" className="space-y-2 border-t border-nx-border pt-4">
      <h3 className="font-medium">In Google Agenda zetten</h3>
      <p className="text-nx-muted">
        Zet je lessen uit NEXUS ook in Google Agenda. NEXUS maakt een geheime agendalink die Google zelf blijft volgen: een les die verandert of
        bijkomt, verandert daar ook. Wat al in je gekoppelde Google Agenda staat (zelfde begin, zelfde einde of naam), laat NEXUS weg, zodat je niets
        dubbel krijgt. Deel de link met niemand.
      </p>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="sr-only">Wat er mee gaat</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked disabled /> Lessen
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={options.appointments} disabled={busy} onChange={(e) => change({ ...options, appointments: e.target.checked })} /> Afspraken uit NEXUS
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={options.deadlines} disabled={busy} onChange={(e) => change({ ...options, deadlines: e.target.checked })} /> Deadlines
        </label>
      </fieldset>

      {link ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label="Agendalink voor Google" readOnly value={link} className={field} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(
                  () => setMessage('Link gekopieerd.'),
                  () => setMessage('Kopiëren lukte niet; selecteer de link en kopieer hem zelf.'),
                )
              }}
            >
              Kopiëren
            </button>
          </div>
          <ol className="list-decimal space-y-0.5 pl-5 text-nx-muted">
            <li>Open Google Agenda op een computer (calendar.google.com; in de gsm-app kan dit niet).</li>
            <li>Klik links naast "Andere agenda's" op + en kies "Via URL".</li>
            <li>Plak de link en klik op "Agenda toevoegen". De agenda heet NEXUS.</li>
          </ol>
          <p className="text-nx-muted">
            Google kijkt zelf om de paar uur naar de link (soms pas na een halve dag); dat kan NEXUS niet versnellen. NEXUS werkt de link bij terwijl het
            open staat op een van je toestellen.{' '}
            {info && `Laatst bijgewerkt ${new Date(info.updatedAt).toLocaleString('nl-BE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={busy} onClick={() => void act(() => feed.enable(options), 'Nieuwe link gemaakt. De oude werkt niet meer: voeg deze toe in Google.')}>
              Nieuwe link
            </button>
            <button type="button" className={button} disabled={busy} onClick={() => void act(() => feed.disable(), 'Gestopt. Verwijder de agenda NEXUS ook in Google.')}>
              Stoppen
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryButton} disabled={busy || !loaded} onClick={() => void act(() => feed.enable(options), 'Je link staat klaar. Volg de stappen hieronder.')}>
            {busy ? 'Bezig…' : 'Maak mijn agendalink'}
          </button>
        </div>
      )}
      <p className="text-nx-muted">
        Liever één keer, in je eigen Google Agenda?{' '}
        <button type="button" className="underline" onClick={() => download(options)}>
          Download een .ics-bestand
        </button>{' '}
        en kies in Google Agenda Instellingen › Importeren en exporteren › Importeren. Dat volgt later geen wijzigingen.
      </p>
      {(error ?? problem) && <Problem text={(error ?? problem)!} />}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
