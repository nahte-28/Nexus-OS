import { useState } from 'react'
import type { PhotoReading } from '@nexus/core'
import { readPhoto, shrinkPhoto } from './photos'

const small = 'rounded-md border border-nx-border px-2 py-1 text-xs hover:bg-nx-surface-2 disabled:opacity-50'

/** A photo of the board read by NEXUS AI, with the photo itself (a JPEG data URL). */
export interface PhotoScore {
  data: string
  reading: PhotoReading
}

/** "Score via foto": take a photo of the board, NEXUS AI reads the darts and [onRead] gets them. */
export function PhotoScoreButton({ onRead }: { onRead: (score: PhotoScore) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const read = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const data = await shrinkPhoto(file)
      const reading = await readPhoto(data)
      if (reading.darts.length === 0) throw new Error(reading.note || 'NEXUS AI zag geen pijlen op de foto.')
      onRead({ data, reading })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'De foto lezen lukte niet.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label className={`${small} cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>
        {busy ? 'NEXUS AI kijkt…' : 'Score via foto'}
        <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Score via foto" disabled={busy} onChange={(e) => void read(e.target.files?.[0])} />
      </label>
      {error && (
        <span role="alert" className="text-xs">
          {error}
        </span>
      )}
    </span>
  )
}
