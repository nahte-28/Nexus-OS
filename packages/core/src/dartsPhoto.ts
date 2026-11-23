/**
 * Darts: a photo as proof of a high checkout. The photo stays on the device; the match keeps what
 * NEXUS AI read on it (the darts) and whether that is the finish, so every device shows the verdict.
 * Pure logic: which finishes ask for proof, reading the AI's answer and judging it.
 */
import type { DartsMatch } from './darts'

/** From this finish up a checkout counts as high, and the scoreboard offers a photo as proof. */
export const PROOF_FROM = 100

/** ok: the darts on the photo make the finish; nok: they do not; unclear: NEXUS AI could not read them. */
export type ProofVerdict = 'ok' | 'nok' | 'unclear'

export interface CheckoutProof {
  /** Index of the leg in match.legs. */
  leg: number
  /** When the photo was added. */
  at: number
  /** Null until NEXUS AI has checked the photo. */
  verdict: ProofVerdict | null
  /** The darts NEXUS AI saw, like ["T20", "T11", "D14"]. */
  darts?: string[]
  /** NEXUS AI's remark, e.g. that a dart is half hidden. */
  note?: string
}

export interface HighFinish {
  leg: number
  side: number
  finish: number
  /** Darts used for the finish. */
  darts: number
}

/** The legs won with a finish of PROOF_FROM or more, by a person (not the bot). */
export function highFinishes(m: DartsMatch): HighFinish[] {
  const out: HighFinish[] = []
  m.legs.forEach((leg, i) => {
    if (leg.winner === null || leg.winner === m.bot?.side) return
    const last = leg.visits[leg.visits.length - 1]
    if (last && !last.bust && last.player === leg.winner && last.score >= PROOF_FROM) out.push({ leg: i, side: leg.winner, finish: last.score, darts: last.darts })
  })
  return out
}

const DART = /^(?:[TD](?:[1-9]|1\d|20)|[1-9]|1\d|20|25|Bull|Mis)$/

/** What a dart label scores: T20 60, D16 32, 5 5, 25, Bull 50, Mis 0; null when it is no dart. */
export function dartValue(label: string): number | null {
  if (!DART.test(label)) return null
  if (label === 'Bull') return 50
  if (label === 'Mis') return 0
  if (label[0] === 'T') return Number(label.slice(1)) * 3
  if (label[0] === 'D') return Number(label.slice(1)) * 2
  return Number(label)
}

const isDoubleDart = (label: string) => label === 'Bull' || label[0] === 'D'

/** Tidies a label the AI wrote: "t20" -> T20, "S5" -> 5, "bull" -> Bull, "miss" -> Mis. */
function tidy(raw: string): string {
  const s = raw.trim().replace(/\s+/g, '')
  if (/^(bull|bullseye|db|d25|50)$/i.test(s)) return 'Bull'
  if (/^(25|sb|outerbull|s25)$/i.test(s)) return '25'
  if (/^(mis|miss|0|m)$/i.test(s)) return 'Mis'
  const m = /^([tdsTDS]?)(\d{1,2})$/.exec(s)
  if (!m) return s
  const ring = m[1].toUpperCase()
  return ring === 'S' || ring === '' ? m[2] : `${ring}${m[2]}`
}

export interface PhotoReading {
  darts: string[]
  note: string
}

/** Reads NEXUS AI's answer, a JSON object {darts: [...], note}; null when it is not that. */
export function parsePhotoReading(text: string): PhotoReading | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) return null
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  const v = raw as Record<string, unknown>
  if (!Array.isArray(v.darts)) return null
  const darts = v.darts
    .filter((d): d is string => typeof d === 'string')
    .map(tidy)
    .filter((d) => dartValue(d) !== null)
    .slice(0, 3)
  return { darts, note: typeof v.note === 'string' ? v.note.slice(0, 300) : '' }
}

/**
 * Whether the darts on the photo are the finish: they add up to it in [darts] darts or fewer and
 * the last one is a double (with double-out). No darts read is unclear.
 */
export function judgeProof(reading: PhotoReading, finish: number, darts: number, doubleOut = true): ProofVerdict {
  if (reading.darts.length === 0) return 'unclear'
  const thrown = reading.darts.filter((d) => d !== 'Mis')
  const total = thrown.reduce((n, d) => n + (dartValue(d) ?? 0), 0)
  const last = thrown[thrown.length - 1]
  if (total !== finish || thrown.length > darts) return 'nok'
  return !doubleOut || (last !== undefined && isDoubleDart(last)) ? 'ok' : 'nok'
}

/** [m] with [proof] for its leg, replacing an earlier one. */
export function withProof(m: DartsMatch, proof: CheckoutProof, now: number): DartsMatch {
  const proofs = [...(m.proofs ?? []).filter((p) => p.leg !== proof.leg), proof].sort((a, b) => a.leg - b.leg)
  return { ...m, proofs, updatedAt: now }
}

/** [m] without the proof of [leg]. */
export function withoutProof(m: DartsMatch, leg: number, now: number): DartsMatch {
  const proofs = (m.proofs ?? []).filter((p) => p.leg !== leg)
  const { proofs: _, ...rest } = m
  return proofs.length > 0 ? { ...m, proofs, updatedAt: now } : { ...rest, updatedAt: now }
}

const VERDICTS: ProofVerdict[] = ['ok', 'nok', 'unclear']

/** The proofs of a stored match, for parseMatch. */
export function parseProofs(raw: unknown, legs: number): CheckoutProof[] {
  const out: CheckoutProof[] = []
  for (const x of Array.isArray(raw) ? raw : []) {
    const p = x as Record<string, unknown> | null
    const leg = typeof p?.leg === 'number' ? Math.round(p.leg) : -1
    if (!p || leg < 0 || leg >= legs || out.some((o) => o.leg === leg)) continue
    const verdict = VERDICTS.find((v) => v === p.verdict) ?? null
    const darts = Array.isArray(p.darts) ? p.darts.filter((d): d is string => typeof d === 'string' && dartValue(d) !== null).slice(0, 3) : undefined
    out.push({
      leg,
      at: typeof p.at === 'number' && Number.isFinite(p.at) ? p.at : 0,
      verdict,
      ...(darts && darts.length > 0 ? { darts } : {}),
      ...(typeof p.note === 'string' && p.note ? { note: p.note.slice(0, 300) } : {}),
    })
  }
  return out
}

/** The id of the photo of [leg] of [matchId] on this device. */
export const proofPhotoId = (matchId: string, leg: number) => `${matchId}:${leg}`
