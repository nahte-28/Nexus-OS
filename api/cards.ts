import Anthropic from '@anthropic-ai/sdk'
import { aiAccess, cors, DEFAULT_MODEL, env, json } from './_shared.js'
import { checkStudyRequest, type StudyRequest } from './study.js'

/**
 * NEXUS AI's Leerkaarten: reads a note or a file the user chose (same input as /api/study) and
 * streams back flashcards as "V: … / A: …" blocks, which the app reads into a deck. Nothing is
 * stored here. Same access rules as /api/ai.
 */

export const CARDS_PROMPT = `Je maakt leerkaarten (flashcards) voor een student Elektronica-ICT (hogeschool, België) uit het materiaal dat je krijgt.
Schrijf in het Nederlands (Belgisch). Geef alleen kaarten, zonder inleiding of slot, elk in deze vorm met een lege regel ertussen:

V: de vraag
A: het antwoord

Regels:
- Eén begrip, definitie, formule of verband per kaart. De vraag is kort en eenduidig; het antwoord kort genoeg om uit het hoofd te kennen.
- Bij een formule: vraag ernaar en zet in het antwoord ook de betekenis en eenheid van elk symbool.
- Gebruik alleen wat in het materiaal staat; verzin niets.
- Is het materiaal onleesbaar of geen studiemateriaal, geef dan geen kaarten.`

export const MAX_CARDS = 60

export function cardsInstruction(r: Pick<StudyRequest, 'name' | 'focus'>, count: number): string {
  return [`Bron: ${r.name}.`, `Maak ongeveer ${count} leerkaarten over het belangrijkste.`, r.focus ? `Wens van de student: ${r.focus}` : ''].filter(Boolean).join(' ')
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: cors(request) })
}

export async function POST(request: Request): Promise<Response> {
  const denied = await aiAccess(request)
  if (denied) return denied

  let raw: Record<string, unknown>
  try {
    raw = (await request.json()) as Record<string, unknown>
  } catch {
    return json(request, 400, 'Ongeldige aanvraag.')
  }
  const parsed = checkStudyRequest(raw)
  if (!parsed.ok) return json(request, 400, parsed.error)
  const source = parsed.value
  const count = Math.min(MAX_CARDS, Math.max(5, Math.round(typeof raw?.count === 'number' ? raw.count : 20)))

  const document: Anthropic.Beta.BetaContentBlockParam =
    source.kind === 'pdf'
      ? { type: 'document', title: source.name, source: { type: 'base64', media_type: 'application/pdf', data: source.data } }
      : { type: 'document', title: source.name, source: { type: 'text', media_type: 'text/plain', data: source.data } }

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
          system: CARDS_PROMPT,
          messages: [{ role: 'user', content: [document, { type: 'text', text: cardsInstruction(source, count) }] }],
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
