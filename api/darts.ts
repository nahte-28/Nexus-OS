import Anthropic from '@anthropic-ai/sdk'
import { aiAccess, aiErrorText, aiKey, cors, DEFAULT_MODEL, env, json } from './_shared.js'

/**
 * NEXUS AI for Darts: reads a photo of the dartboard and streams back which darts are in it, as JSON
 * {"darts": [...], "note": "..."}. The app judges whether that is the finish the player entered.
 * The photo is not stored here. Same access rules as /api/ai.
 */

/** The app sends a JPEG of at most 1600 px (about 0.5 MB); Vercel takes bodies up to 4.5 MB. */
export const MAX_PHOTO_BASE64 = 4_000_000

export const DARTS_PROMPT = `Je bekijkt een foto van een dartbord (steel tip of soft tip) na een beurt van drie pijlen.
Zeg welke pijlen in het bord steken en in welk vak. Gebruik voor elk vak precies deze notatie:
- T1 tot T20 voor de triple-ring (smalle binnenring), D1 tot D20 voor de double-ring (smalle buitenring),
- 1 tot 20 voor een gewoon (single) vak, 25 voor de groene ring rond de bull, Bull voor het rode midden,
- Mis voor een pijl die naast het scoregebied of in de surround zit.
Kijk waar de punt van de pijl het bord raakt, niet waar de flight is. Het nummer van een vak staat op de nummerring buiten het bord: 20 staat bovenaan.
Geef hoogstens drie pijlen, in de volgorde waarin ze waarschijnlijk gegooid zijn als dat te zien is, anders in willekeurige volgorde.
Is een pijl niet zeker te lezen, zet hem er toch bij met je beste schatting en zeg het kort in note. Is er geen dartbord of geen pijl te zien, geef dan een lege lijst en zeg waarom in note.
Schrijf note in het Nederlands (Belgisch), in één korte zin.`

const SCHEMA = {
  type: 'object',
  properties: {
    darts: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
  required: ['darts', 'note'],
  additionalProperties: false,
}

export interface DartsPhotoRequest {
  /** Base64 of a JPEG. */
  image: string
}

export function checkDartsPhoto(value: unknown): { ok: true; value: DartsPhotoRequest } | { ok: false; error: string } {
  if (typeof value !== 'object' || value === null) return { ok: false, error: 'Ongeldige aanvraag.' }
  const v = value as Record<string, unknown>
  if (typeof v.image !== 'string' || !v.image) return { ok: false, error: 'Er is geen foto.' }
  if (v.image.length > MAX_PHOTO_BASE64) return { ok: false, error: 'Deze foto is te groot voor NEXUS AI.' }
  if (!/^[A-Za-z0-9+/]+=*$/.test(v.image)) return { ok: false, error: 'Deze foto is geen JPEG.' }
  return { ok: true, value: { image: v.image } }
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: cors(request) })
}

export async function POST(request: Request): Promise<Response> {
  const denied = await aiAccess(request)
  if (denied) return denied

  let parsed: ReturnType<typeof checkDartsPhoto>
  try {
    parsed = checkDartsPhoto(await request.json())
  } catch {
    return json(request, 400, 'Ongeldige aanvraag.')
  }
  if (!parsed.ok) return json(request, 400, parsed.error)

  const client = new Anthropic({ apiKey: aiKey(request) })
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      try {
        const stream = client.beta.messages.stream({
          model: env('NEXUS_AI_MODEL') ?? DEFAULT_MODEL,
          max_tokens: 4000,
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: DARTS_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: parsed.value.image } },
                { type: 'text', text: 'Welke pijlen zitten er in het bord?' },
              ],
            },
          ],
        })
        stream.on('text', (text) => send({ type: 'text', text }))
        const message = await stream.finalMessage()
        send({ type: 'done', stop_reason: message.stop_reason })
      } catch (err) {
        send({ type: 'error', message: aiErrorText(err, request) })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(body, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', ...cors(request) },
  })
}
