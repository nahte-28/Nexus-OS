import { useState, type FormEvent } from 'react'
import { removeOwnKey, saveOwnKey, useOwnKey } from './ownKey'

const field = 'min-w-0 flex-1 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 font-mono outline-none'
const button = 'rounded-lg border border-nx-border px-3 py-1.5 text-sm hover:bg-nx-surface-2 disabled:opacity-60'
const primaryButton = 'rounded-lg bg-nx-accent px-3 py-1.5 text-sm font-medium text-nx-accent-text disabled:opacity-60'

/** NEXUS AI › Eigen sleutel: use NEXUS AI with your own Anthropic account and pay for your own use. */
export function OwnKeySettings() {
  const own = useOwnKey()
  const [draft, setDraft] = useState('')
  const [show, setShow] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true)
    setNotice(null)
    try {
      await work()
      setProblem(null)
      setNotice(done)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const save = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await saveOwnKey(draft)
      setDraft('')
      setShow(false)
    }, 'Je sleutel is bewaard. NEXUS AI gebruikt hem vanaf je volgende vraag.')
  }

  return (
    <section className="space-y-3">
      <h3 className="font-medium">Je eigen AI-sleutel</h3>
      <p className="text-nx-muted">
        Met je eigen sleutel van Anthropic gebruik je NEXUS AI op je eigen account: jij betaalt je eigen gebruik, en je hebt geen toelating van de beheerder nodig.
      </p>
      {!own.loaded ? (
        <p className="text-nx-muted">Laden…</p>
      ) : own.hint ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-nx-border p-3">
          <span className="min-w-0 flex-1">
            <span className="block">
              In gebruik: <span className="font-mono">{own.hint}</span>
            </span>
            {own.savedAt && <span className="block text-xs text-nx-muted">Bewaard op {new Date(own.savedAt).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
          </span>
          <button type="button" className={button} disabled={busy} onClick={() => void run(removeOwnKey, 'Je sleutel is van dit apparaat verwijderd.')}>
            Verwijderen
          </button>
        </div>
      ) : (
        <p className="text-nx-muted">Er staat nog geen eigen sleutel op dit apparaat. Zonder eigen sleutel werkt NEXUS AI alleen voor de accounts die de beheerder toeliet.</p>
      )}
      <form onSubmit={save} className="space-y-2">
        <label className="block text-xs text-nx-muted" htmlFor="own-ai-key">
          {own.hint ? 'Andere sleutel' : 'Sleutel'}
        </label>
        <div className="flex gap-2">
          <input id="own-ai-key" type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="sk-ant-..." className={field} />
          <button type="button" className={button} aria-pressed={show} onClick={() => setShow(!show)}>
            {show ? 'Verbergen' : 'Tonen'}
          </button>
          <button type="submit" className={primaryButton} disabled={busy || !draft.trim()}>
            Bewaren
          </button>
        </div>
      </form>
      {problem && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">{problem}</p>}
      {notice && <p role="status" className="rounded-lg border border-nx-border bg-nx-surface-2 p-3">{notice}</p>}
      <ol className="list-decimal space-y-1 pl-5 text-xs text-nx-muted">
        <li>Maak een account op console.anthropic.com en zet er tegoed op (Billing).</li>
        <li>Maak bij API Keys een nieuwe sleutel en kopieer hem.</li>
        <li>Plak hem hierboven en tik op Bewaren.</li>
      </ol>
      <p className="text-xs text-nx-muted">
        Je sleutel blijft op dit apparaat, versleuteld met een sleutel die je browser niet afgeeft. Hij gaat niet mee met syncen of een back-up, en de NEXUS-server gebruikt hem alleen voor die ene vraag en bewaart hem nooit. Op elk apparaat zet je hem apart; afmelden haalt hem weg.
      </p>
    </section>
  )
}
