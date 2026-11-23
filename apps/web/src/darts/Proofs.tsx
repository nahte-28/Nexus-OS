import { useEffect, useState } from 'react'
import { highFinishes, withoutProof, type CheckoutProof, type DartsMatch, type HighFinish } from '@nexus/core'
import { checkProof, getPhoto, removePhoto, savePhoto, shrinkPhoto, storeProof } from './photos'
import { dartsStore } from './store'

const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'

/**
 * High checkouts of a match (100 or more) with a photo as proof: take or pick a photo of the board,
 * NEXUS AI reads the darts in it and says whether they make the finish.
 */
export function CheckoutProofs({ match }: { match: DartsMatch }) {
  const finishes = highFinishes(match)
  if (finishes.length === 0) return null
  return (
    <section aria-label="Bewijsfoto's" className="space-y-2 rounded-lg border border-nx-border p-3">
      <h3 className="font-medium">Hoge finishes</h3>
      <p className="text-xs text-nx-muted">Trek een foto van het bord voor je de pijlen uittrekt. NEXUS AI kijkt na of de pijlen de finish maken. De foto blijft op dit toestel.</p>
      <ul className="space-y-2">
        {finishes.map((f) => (
          <ProofRow key={`${f.leg}-${f.finish}`} match={match} finish={f} proof={match.proofs?.find((p) => p.leg === f.leg)} />
        ))}
      </ul>
    </section>
  )
}

function ProofRow({ match, finish, proof }: { match: DartsMatch; finish: HighFinish; proof: CheckoutProof | undefined }) {
  const [photo, setPhoto] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [big, setBig] = useState(false)
  useEffect(() => {
    let live = true
    getPhoto(match.id, finish.leg)
      .then((p) => live && setPhoto(p?.data ?? null))
      .catch(() => live && setPhoto(null))
    return () => {
      live = false
    }
  }, [match.id, finish.leg])

  const check = async (data: string, at: number) => {
    setBusy(true)
    setError(null)
    try {
      storeProof(match.id, await checkProof(finish, match.doubleOut, data, at), finish.finish)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Controleren mislukt.')
    } finally {
      setBusy(false)
    }
  }
  const add = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const data = await shrinkPhoto(file)
      const at = Date.now()
      await savePhoto(match.id, finish.leg, data, at)
      setPhoto(data)
      storeProof(match.id, { leg: finish.leg, at, verdict: null }, finish.finish)
      await check(data, at)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'De foto bewaren lukte niet.')
    }
  }
  const remove = async () => {
    await removePhoto(match.id, finish.leg).catch(() => {})
    setPhoto(null)
    dartsStore.update((s) => ({ ...s, matches: s.matches.map((m) => (m.id === match.id ? withoutProof(m, finish.leg, Date.now()) : m)) }))
  }
  const name = match.players[finish.side]
  const legNo = finish.leg + 1
  return (
    <li className="space-y-1 rounded border border-nx-border px-2 py-1.5" aria-label={`Finish van ${finish.finish} in leg ${legNo}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span>
          Leg {legNo}: <b>{name}</b> gooide <b>{finish.finish}</b> uit
        </span>
        <Verdict proof={proof} busy={busy} />
        <span className="ml-auto flex flex-wrap gap-1">
          {photo === null && (
            <label className={`${small} cursor-pointer`}>
              Bewijsfoto
              <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label={`Bewijsfoto voor ${finish.finish}`} onChange={(e) => void add(e.target.files?.[0])} />
            </label>
          )}
          {photo && proof?.verdict !== 'ok' && (
            <button type="button" className={small} disabled={busy} onClick={() => void check(photo, proof?.at ?? Date.now())}>
              {proof?.verdict ? 'Opnieuw controleren' : 'Controleren met NEXUS AI'}
            </button>
          )}
          {(photo || proof) && (
            <button type="button" className={small} disabled={busy} aria-label={`Bewijsfoto van ${finish.finish} weghalen`} onClick={() => void remove()}>
              Weghalen
            </button>
          )}
        </span>
      </div>
      {photo && (
        <button type="button" className="block" aria-label={big ? 'Foto kleiner' : 'Foto groter'} onClick={() => setBig(!big)}>
          <img src={photo} alt={`Bord na de finish van ${finish.finish}`} className={`rounded border border-nx-border object-cover ${big ? 'max-h-[70vh] w-auto' : 'h-20 w-20'}`} />
        </button>
      )}
      {!photo && photo !== undefined && proof && <p className="text-xs text-nx-muted">De foto staat op een ander toestel.</p>}
      {error && (
        <p role="alert" className="text-xs">
          {error}
        </p>
      )}
    </li>
  )
}

function Verdict({ proof, busy }: { proof: CheckoutProof | undefined; busy: boolean }) {
  if (busy) return <span className="text-xs text-nx-muted">NEXUS AI kijkt…</span>
  if (!proof) return null
  const darts = proof.darts?.join(' ')
  const text =
    proof.verdict === 'ok'
      ? `✓ Klopt volgens NEXUS AI${darts ? `: ${darts}` : ''}`
      : proof.verdict === 'nok'
        ? `✗ Klopt niet volgens NEXUS AI${darts ? `: zag ${darts}` : ''}`
        : proof.verdict === 'unclear'
          ? '? NEXUS AI kon de pijlen niet lezen'
          : 'Foto toegevoegd, nog niet gecontroleerd'
  return (
    <span className={`text-xs ${proof.verdict === 'ok' ? 'font-medium text-nx-accent' : 'text-nx-muted'}`} title={proof.note}>
      {text}
      {proof.note && proof.verdict !== 'ok' && <span className="block">{proof.note}</span>}
    </span>
  )
}
