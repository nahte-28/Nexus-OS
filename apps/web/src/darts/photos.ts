import { highFinishes, judgeProof, parsePhotoReading, proofPhotoId, withProof, type CheckoutProof, type HighFinish, type PhotoReading } from '@nexus/core'
import { aiHeaders } from '../ai/ownKey'
import { logEvent } from '../devtools/log'
import { readAiStream } from '../files/study'
import { apiBase } from '../platform/desktop'
import { getValue, update } from '../state/db'
import { dartsStore } from './store'
import { supabase } from '../sync/supabase'

/**
 * Darts photos as proof of a high checkout. The photo stays on this device (IndexedDB store
 * 'dartsPhotos'); the match keeps what NEXUS AI read on it, so the verdict syncs.
 */

export interface DartsPhoto {
  id: string
  matchId: string
  leg: number
  /** A JPEG as data URL, at most MAX_SIDE px. */
  data: string
  at: number
}

/** Longest side of a stored photo: sharp enough to read the darts, small enough for NEXUS AI. */
export const MAX_SIDE = 1600

/** Makes a JPEG data URL of at most MAX_SIDE px from a photo the person chose or took. */
export async function shrinkPhoto(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Deze foto kan hier niet verkleind worden.')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const getPhoto = (matchId: string, leg: number) => getValue<DartsPhoto>('dartsPhotos', proofPhotoId(matchId, leg))

export async function savePhoto(matchId: string, leg: number, data: string, at = Date.now()): Promise<DartsPhoto> {
  const photo: DartsPhoto = { id: proofPhotoId(matchId, leg), matchId, leg, data, at }
  await update('dartsPhotos', { put: [photo] })
  return photo
}

export const removePhoto = (matchId: string, leg: number) => update('dartsPhotos', { remove: [proofPhotoId(matchId, leg)] })

type Token = () => Promise<string | null>
const sessionToken: Token = async () => (await supabase?.auth.getSession())?.data.session?.access_token ?? null

/** Asks NEXUS AI which darts are on [data] (a JPEG data URL). */
export async function readPhoto(data: string, token: Token = sessionToken, base = apiBase): Promise<PhotoReading> {
  const access = await token()
  if (!access) throw new Error('Meld je aan in de Account-app om NEXUS AI te gebruiken.')
  const response = await fetch(`${base}/api/darts`, {
    method: 'POST',
    headers: await aiHeaders(access),
    body: JSON.stringify({ image: data.replace(/^data:image\/jpeg;base64,/, '') }),
  })
  const text = await readAiStream(response, () => {}, 'Deze foto is te groot voor NEXUS AI.')
  const reading = parsePhotoReading(text)
  if (!reading) throw new Error('NEXUS AI gaf geen leesbaar antwoord. Probeer het opnieuw.')
  return reading
}

/** Checks the photo of [finish] with NEXUS AI: the proof with its verdict. */
export async function checkProof(finish: HighFinish, doubleOut: boolean, data: string, at: number, read = readPhoto): Promise<CheckoutProof> {
  const reading = await read(data)
  const verdict = judgeProof(reading, finish.finish, finish.darts, doubleOut)
  logEvent('ai', `Darts-foto gecontroleerd: ${verdict}`)
  return { leg: finish.leg, at, verdict, ...(reading.darts.length > 0 ? { darts: reading.darts } : {}), ...(reading.note ? { note: reading.note } : {}) }
}

/**
 * Puts [proof] on the match [matchId] as it is now in the store, so a check that took a while does
 * not undo visits thrown meanwhile. Nothing happens when that finish is no longer there (undone).
 */
export function storeProof(matchId: string, proof: CheckoutProof, finish: number): void {
  dartsStore.update((s) => ({
    ...s,
    matches: s.matches.map((m) => (m.id === matchId && highFinishes(m).some((f) => f.leg === proof.leg && f.finish === finish) ? withProof(m, proof, Date.now()) : m)),
  }))
}
