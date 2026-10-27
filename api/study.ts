import Anthropic from '@anthropic-ai/sdk'
import { aiAccess, cors, DEFAULT_MODEL, env, json } from './_shared.js'

/**
 * NEXUS AI study help: reads a file the user chose (a PDF, or the text of a Word or text file)
 * and streams back a study summary in Markdown, with additions and feedback when asked. The
 * file goes straight to Claude and is not stored here. Same access rules as /api/ai.
 */

/** Vercel accepts 4.5 MB per request; a 3 MB PDF is about 4 MB as base64. */
const MAX_PDF_BASE64 = 4_200_000
const MAX_TEXT = 300_000

export const STUDY_PROMPT = `Je bent de studiehulp van NEXUS OS voor een student Elektronica-ICT (hogeschool, België).
Je krijgt een bestand van de student: cursusmateriaal of een samenvatting die de student zelf of een medestudent maakte.
Schrijf in het Nederlands (Belgisch), in Markdown, en gebruik alleen deze koppen, in deze volgorde:

## Samenvatting
Een eigen, goed gestructureerde samenvatting om mee te studeren: kernbegrippen, definities, formules (met de betekenis van elk symbool) en verbanden. Gebruik korte alinea's en opsommingen. Neem niets over wat niet in het bestand staat.

## Aanvullingen
Alleen als erom gevraagd wordt: interessante of nuttige dingen die er nog niet in staan (een voorbeeld, een ezelsbruggetje, een veelgemaakte fout, een verband met een ander vak). Dit komt uit je eigen kennis, dus zeg dat het een aanvulling is en verzin geen bronnen.

## Feedback
Alleen als erom gevraagd wordt: wat is goed aan de samenvatting, wat ontbreekt of is onduidelijk, en wat lijkt fout (met de juiste versie). Wees eerlijk en concreet, met hoogstens zeven punten.

Is het bestand onleesbaar of geen studiemateriaal, zeg dat dan kort in plaats van iets te verzinnen.`

export interface StudyRequest {
  name: string
  kind: 'pdf' | 'text'
  /** Base64 for a PDF, plain text otherwise. */
  data: string
  additions: boolean
  feedback: boolean
  focus: string
}

export function checkStudyRequest(value: unknown): { ok: true; value: StudyRequest } | { ok: false; error: string } {
  if (typeof value !== 'object' || value === null) return { ok: false, error: 'Ongeldige aanvraag.' }
  const v = value as Record<string, unknown>
  if (typeof v.name !== 'string' || !v.name.trim()) return { ok: false, error: 'Het bestand heeft geen naam.' }
  if (v.kind !== 'pdf' && v.kind !== 'text') return { ok: false, error: 'NEXUS AI leest pdf, Word en tekst.' }
  if (typeof v.data !== 'string' || !v.data) return { ok: false, error: 'Het bestand is leeg.' }
  if (v.kind === 'pdf' && (v.data.length > MAX_PDF_BASE64 || !/^[A-Za-z0-9+/]+=*$/.test(v.data))) {
    return { ok: false, error: 'Deze pdf is te groot voor NEXUS AI (hoogstens 3 MB).' }
  }
  if (v.kind === 'text' && v.data.length > MAX_TEXT) return { ok: false, error: 'Deze tekst is te lang voor NEXUS AI.' }
  return {
    ok: true,
    value: {
      name: v.name.trim().slice(0, 200),
      kind: v.kind,
      data: v.data,
      additions: v.additions !== false,
      feedback: v.feedback !== false,
      focus: typeof v.focus === 'string' ? v.focus.trim().slice(0, 500) : '',
    },
  }
}

/** What the student asks for, from the chosen options. */
export function studyInstruction(r: Pick<StudyRequest, 'name' | 'additions' | 'feedback' | 'focus'>): string {
  const parts = [`Bestand: ${r.name}.`, 'Maak de samenvatting.']
  parts.push(r.additions ? 'Voeg ook aanvullingen toe.' : 'Laat de kop Aanvullingen weg.')
  parts.push(r.feedback ? 'Geef ook feedback op het bestand als samenvatting.' : 'Laat de kop Feedback weg.')
  if (r.focus) parts.push(`Wens van de student: ${r.focus}`)
  return parts.join(' ')
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: cors(request) })
}

export async function POST(request: Request): Promise<Response> {
  const denied = await aiAccess(request)
  if (denied) return denied

  let parsed: ReturnType<typeof checkStudyRequest>
  try {
    parsed = checkStudyRequest(await request.json())
  } catch {
    return json(request, 400, 'Ongeldige aanvraag.')
  }
  if (!parsed.ok) return json(request, 400, parsed.error)
  const study = parsed.value

  const document: Anthropic.Beta.BetaContentBlockParam =
    study.kind === 'pdf'
      ? { type: 'document', title: study.name, source: { type: 'base64', media_type: 'application/pdf', data: study.data } }
      : { type: 'document', title: study.name, source: { type: 'text', media_type: 'text/plain', data: study.data } }

  const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      try {
        const stream = client.beta.messages.stream({
          model: env('NEXUS_AI_MODEL') ?? DEFAULT_MODEL,
          max_tokens: 16000,
          output_config: { effort: 'medium' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: STUDY_PROMPT,
          messages: [{ role: 'user', content: [document, { type: 'text', text: studyInstruction(study) }] }],
        })
        stream.on('text', (text) => send({ type: 'text', text }))
        const message = await stream.finalMessage()
        send({ type: 'done', stop_reason: message.stop_reason, usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens } })
      } catch (err) {
        send({ type: 'error', message: err instanceof Anthropic.APIError ? `De AI-dienst gaf een fout (${err.status ?? 'netwerk'}).` : 'De AI is niet bereikbaar.' })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(body, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', ...cors(request) },
  })
}
