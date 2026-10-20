import Anthropic from '@anthropic-ai/sdk'
import { cors, emailForToken, env, json } from './_shared.js'

/**
 * NEXUS AI: a thin, authenticated proxy to Claude. The model only proposes actions;
 * the NEXUS client runs a tool after the user allowed it, then sends the result back.
 *
 * Vercel environment variables:
 *   ANTHROPIC_API_KEY         required, the key that pays for the requests
 *   NEXUS_AI_ALLOWED_EMAILS   required, comma-separated accounts that may use the assistant
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY   already set for the web app; used to check logins
 *   NEXUS_AI_MODEL            optional, defaults to claude-opus-5-5
 */

export const DEFAULT_MODEL = 'claude-opus-5-5'
const MAX_MESSAGES = 80
const MAX_BODY_BYTES = 400_000

export const SYSTEM_PROMPT = `Je bent NEXUS AI, de assistent in NEXUS OS: een persoonlijke omgeving op de pc, de gsm (OnePlus 15R) en het horloge (OnePlus Watch 4) van de gebruiker.
Antwoord in de taal van de gebruiker, meestal Nederlands (Belgisch), kort en concreet.

Je kunt acties voorstellen met de tools. De gebruiker ziet elke actie en moet ze eerst toestaan; een geweigerde actie probeer je niet opnieuw, maar je zegt wat je anders kunt doen.
- Notities: zoek met search_notes voor je iets over de notities van de gebruiker beweert. Maak een notitie met create_note als de gebruiker iets wil bewaren.
- Herinneringen: create_reminder plant een melding op een tijdstip, eventueel herhalend. Reken tijden uit vanaf het huidige tijdstip dat bij het bericht van de gebruiker staat en gebruik de tijdzone van de gebruiker. Herinneringen gaan af op het apparaat waar NEXUS draait; met target "phone" verschijnen ze ook op de gsm en het horloge.
- send_to_phone stuurt meteen een melding naar de gsm en het horloge.
- set_theme wisselt tussen de thema's Focus (rustig, licht) en Pulse (donker, futuristisch).
Doe niets wat de gebruiker niet vroeg, en verzin geen inhoud van notities.`

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'search_notes',
    description:
      'Zoekt in de notities van de gebruiker. Zonder query krijg je de recentste notities. Geeft titel, id en (een deel van) de inhoud terug.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Woorden om op te zoeken in titel en inhoud; leeg voor de recentste notities.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_note',
    description: 'Maakt een nieuwe notitie aan in de Notities-app.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Korte titel.' },
        body: { type: 'string', description: 'Inhoud van de notitie, platte tekst.' },
      },
      required: ['title', 'body'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_reminders',
    description: 'Toont de geplande herinneringen met hun id, tijdstip, herhaling en doel.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'create_reminder',
    description: 'Plant een herinnering. Ze verschijnt als melding op het gekozen tijdstip.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Wat de melding zegt, bv. "Verslag inleveren".' },
        text: { type: 'string', description: 'Optionele extra uitleg.' },
        at: {
          type: 'string',
          description: 'Tijdstip in ISO 8601 met tijdzoneverschil, bv. 2026-10-20T09:00:00+02:00.',
        },
        repeat: { type: 'string', enum: ['none', 'daily', 'weekly'], description: 'Herhaling; standaard none.' },
        target: {
          type: 'string',
          enum: ['this_device', 'phone'],
          description: 'this_device: alleen hier. phone: ook op de gsm en het horloge. Standaard phone.',
        },
      },
      required: ['title', 'at'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_reminder',
    description: 'Verwijdert een geplande herinnering.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Id uit list_reminders.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'send_to_phone',
    description: 'Stuurt nu een melding naar de gsm van de gebruiker; het horloge toont ze ook.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_theme',
    description: 'Wisselt het thema van NEXUS.',
    input_schema: {
      type: 'object',
      properties: { theme: { type: 'string', enum: ['focus', 'pulse'] } },
      required: ['theme'],
      additionalProperties: false,
    },
  },
]

export function allowedEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** Checks the shape of the conversation the client sends; returns an error text or null. */
export function checkMessages(messages: unknown): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return 'Het gesprek is leeg.'
  if (messages.length > MAX_MESSAGES) return 'Dit gesprek is te lang. Begin een nieuw gesprek.'
  for (const m of messages) {
    if (typeof m !== 'object' || m === null) return 'Ongeldig bericht.'
    const { role, content } = m as { role?: unknown; content?: unknown }
    if (role !== 'user' && role !== 'assistant') return 'Ongeldige rol in het gesprek.'
    if (typeof content !== 'string' && !Array.isArray(content)) return 'Ongeldige inhoud in het gesprek.'
  }
  if ((messages[0] as { role: string }).role !== 'user') return 'Een gesprek begint met de gebruiker.'
  return null
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: cors(request) })
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = env('ANTHROPIC_API_KEY')
  const allowed = allowedEmails(process.env.NEXUS_AI_ALLOWED_EMAILS)
  if (!apiKey || allowed.size === 0) {
    return json(request, 503, 'NEXUS AI is nog niet ingesteld: zet ANTHROPIC_API_KEY en NEXUS_AI_ALLOWED_EMAILS in Vercel.')
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json(request, 401, 'Meld je aan om NEXUS AI te gebruiken.')
  let email: string | null
  try {
    email = await emailForToken(token)
  } catch (err) {
    return json(request, 503, err instanceof Error ? err.message : 'Aanmelding controleren mislukt.')
  }
  if (!email) return json(request, 401, 'Je sessie is verlopen. Meld je opnieuw aan.')
  if (!allowed.has(email)) return json(request, 403, 'Dit account mag NEXUS AI niet gebruiken.')

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return json(request, 413, 'Dit gesprek is te groot. Begin een nieuw gesprek.')
  let messages: Anthropic.Beta.BetaMessageParam[]
  try {
    messages = (JSON.parse(raw) as { messages: Anthropic.Beta.BetaMessageParam[] }).messages
  } catch {
    return json(request, 400, 'Ongeldige aanvraag.')
  }
  const problem = checkMessages(messages)
  if (problem) return json(request, 400, problem)

  const client = new Anthropic({ apiKey })
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      try {
        const stream = client.beta.messages.stream({
          model: env('NEXUS_AI_MODEL') ?? DEFAULT_MODEL,
          max_tokens: 16000,
          output_config: { effort: 'medium' },
          // On a policy decline the API re-runs the turn on a fallback model it picks.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          cache_control: { type: 'ephemeral' },
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages,
        })
        stream.on('text', (text) => send({ type: 'text', text }))
        const message = await stream.finalMessage()
        send({
          type: 'done',
          message: {
            role: 'assistant',
            content: message.content,
            stop_reason: message.stop_reason,
            model: message.model,
            usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens },
          },
        })
      } catch (err) {
        send({ type: 'error', message: errorText(err) })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(body, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', ...cors(request) },
  })
}

function errorText(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'De Anthropic-sleutel op de server is ongeldig.'
  if (err instanceof Anthropic.RateLimitError) return 'Even te veel aanvragen. Probeer het zo opnieuw.'
  if (err instanceof Anthropic.BadRequestError) return `De AI weigerde de aanvraag: ${err.message}`
  if (err instanceof Anthropic.APIError) return `De AI-dienst gaf een fout (${err.status ?? 'netwerk'}).`
  return 'De AI is niet bereikbaar.'
}
