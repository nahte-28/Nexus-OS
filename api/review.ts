import Anthropic from '@anthropic-ai/sdk'
import { aiAccess, cors, DEFAULT_MODEL, env, json } from './_shared.js'

/**
 * NEXUS AI's Weekoverzicht, and with kind "finance" advice about a month in Financiën: gets the facts of the student's week (built on the device: lessons,
 * deadlines, appointments, focus time, habits, marks) and streams back a review of the week and a
 * plan for the next one, in Markdown. Nothing is stored here. Same access rules as /api/ai.
 */

const MAX_FACTS = 20_000

export const REVIEW_PROMPT = `Je bent de studiecoach van NEXUS OS voor een student Elektronica-ICT (hogeschool, België).
Je krijgt de feiten van de afgelopen week en van volgende week, zoals NEXUS ze bijhoudt. Schrijf in het Nederlands (Belgisch), in Markdown, kort en concreet, met alleen deze koppen in deze volgorde:

## Je week
Drie tot vijf punten: wat goed ging, wat bleef liggen en wat opvalt (focustijd, gewoontes, gemiste deadlines). Eerlijk maar bemoedigend.

## Volgende week
Wat eraan komt, het drukste moment en waar het krap wordt.

## Plan
Per dag van volgende week één of twee concrete acties, rond de lessen en afspraken heen, zodat elke open deadline op tijd af is. Vermeld een geschatte tijd per actie. Houd rekening met cijfers waar nog veel nodig is.

Gebruik alleen de feiten die je krijgt; verzin geen lessen, deadlines of cijfers. Ontbreken er gegevens (bv. geen lessen of geen cijfers), zeg dat dan kort in plaats van te gokken.`

export const FINANCE_PROMPT = `Je bent de geldcoach van NEXUS OS voor een student (hogeschool, België).
Je krijgt de cijfers van een maand uit de app Financiën: inkomen, uitgaven per categorie, budgetten, vorige maanden, abonnementen, vaste bedragen, spaardoelen en gedeelde kosten. Schrijf in het Nederlands (Belgisch), in Markdown, kort en concreet, met alleen deze koppen in deze volgorde:

## Je maand
Drie tot vijf punten: hoe de maand loopt tegenover het inkomen, de budgetten en vorige maanden, en wat opvalt.

## Tips
Drie tot vijf haalbare tips voor een student om te besparen of beter te plannen, elk met het bedrag dat het ongeveer oplevert per maand. Kijk naar de grootste categorieën, budgetten die opraken en abonnementen.

## Volgende stap
Eén ding om deze week te doen.

Gebruik alleen de cijfers die je krijgt; verzin geen uitgaven of bedragen. Geef geen beleggingsadvies en raad geen leningen of financiële producten aan. Ontbreken er gegevens, zeg dat dan kort.`

export type ReviewKind = 'week' | 'finance'

export function checkReviewRequest(value: unknown): { ok: true; facts: string; wish: string; kind: ReviewKind } | { ok: false; error: string } {
  if (typeof value !== 'object' || value === null) return { ok: false, error: 'Ongeldige aanvraag.' }
  const v = value as Record<string, unknown>
  const kind: ReviewKind = v.kind === 'finance' ? 'finance' : 'week'
  const what = kind === 'finance' ? 'je maand' : 'je week'
  if (typeof v.facts !== 'string' || !v.facts.trim()) return { ok: false, error: `Er zijn geen gegevens over ${what}.` }
  if (v.facts.length > MAX_FACTS) return { ok: false, error: `${what.charAt(0).toUpperCase()}${what.slice(1)} heeft te veel gegevens voor NEXUS AI.` }
  return { ok: true, facts: v.facts, wish: typeof v.wish === 'string' ? v.wish.trim().slice(0, 500) : '', kind }
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: cors(request) })
}

export async function POST(request: Request): Promise<Response> {
  const denied = await aiAccess(request)
  if (denied) return denied

  let parsed: ReturnType<typeof checkReviewRequest>
  try {
    parsed = checkReviewRequest(await request.json())
  } catch {
    return json(request, 400, 'Ongeldige aanvraag.')
  }
  if (!parsed.ok) return json(request, 400, parsed.error)
  const text = `Feiten van NEXUS:\n\n${parsed.facts}${parsed.wish ? `\n\nWens van de student: ${parsed.wish}` : ''}`

  const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      try {
        const stream = client.beta.messages.stream({
          model: env('NEXUS_AI_MODEL') ?? DEFAULT_MODEL,
          max_tokens: 8000,
          output_config: { effort: 'medium' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: parsed.kind === 'finance' ? FINANCE_PROMPT : REVIEW_PROMPT,
          messages: [{ role: 'user', content: text }],
        })
        stream.on('text', (t) => send({ type: 'text', text: t }))
        const message = await stream.finalMessage()
        send({ type: 'done', stop_reason: message.stop_reason })
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
