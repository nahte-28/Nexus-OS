/**
 * NEXUS MCP-server (R14): the protocol and the tools an assistant such as Claude gets when you
 * connect it to NEXUS. Pure: the Vercel function (api/mcp.ts) passes in [McpData], which reads and
 * writes with your own login, so row-level security decides what is reachable. Creating uses the
 * same checks as the forms, Ctrl+K and NEXUS AI (parseDeadline, parseAppointment).
 *
 * Only JSON responses (no streaming, no sessions): every request stands on its own.
 */
import type { CalendarEvent } from './calendar'
import { agendaDay, deadlinesOf, parseAppointment, parseDeadline, type AgendaEntry, type LifeItem } from './life'
import { noteTitle, type Note } from './notes'
import type { Lesson } from './profiles'

export const MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const
export const MCP_SERVER_INFO = { name: 'nexus-os', title: 'NEXUS OS', version: '1.0.0' }

export interface McpData {
  now: number
  timeZone: string
  newId(): string
  lifeItems(): Promise<LifeItem[]>
  /** The school calendar, the typed-in timetable and a linked Google Agenda, from Profielen. */
  timetable(): Promise<{ calendarEvents: CalendarEvent[]; lessons: Lesson[]; googleEvents: CalendarEvent[] }>
  /** Notes that are not deleted, newest first. */
  notes(): Promise<Note[]>
  saveNote(note: Note): Promise<void>
  saveLifeItem(item: LifeItem): Promise<void>
}

type Json = Record<string, unknown>

interface Tool {
  name: string
  title: string
  description: string
  inputSchema: Json
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint: boolean }
  run(args: Json, data: McpData): Promise<unknown>
}

/** A tool's answer that is a mistake of the caller (bad input), shown to the assistant as such. */
class ToolInputError extends Error {}

const MAX_NOTE_TEXT = 20_000
const MAX_NOTE_TITLE = 200
const DAY_MS = 86_400_000

const read = { readOnlyHint: true, openWorldHint: false } as const
const create = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const

function local(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('nl-BE', { timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ms)
}

function when(ms: number, timeZone: string) {
  return { at: new Date(ms).toISOString(), lokaal: local(ms, timeZone) }
}

function text(value: unknown, field: string, max: number, required = false): string {
  if (value === undefined || value === null) {
    if (required) throw new ToolInputError(`${field} ontbreekt.`)
    return ''
  }
  if (typeof value !== 'string') throw new ToolInputError(`${field} moet tekst zijn.`)
  if (required && !value.trim()) throw new ToolInputError(`${field} mag niet leeg zijn.`)
  return value.slice(0, max)
}

function int(value: unknown, field: string, min: number, max: number, fallback: number): number {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new ToolInputError(`${field} moet een geheel getal van ${min} tot ${max} zijn.`)
  return value
}

/** Local midnight of the day [date] (YYYY-MM-DD) or of today, in the runtime's time zone. */
function dayStart(date: unknown, now: number): number {
  if (date === undefined || date === null || date === '') {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ToolInputError('Datum moet de vorm 2026-11-27 hebben.')
  const [y, m, d] = date.split('-').map(Number)
  const start = new Date(y, m - 1, d).getTime()
  if (!Number.isFinite(start)) throw new ToolInputError('Onbekende datum.')
  return start
}

function entry(e: AgendaEntry, timeZone: string): Json {
  const base: Json = { soort: e.kind, titel: e.title, ...when(e.at, timeZone), ...(e.detail ? { detail: e.detail } : {}) }
  if ('end' in e) base.einde = when(e.end, timeZone).lokaal
  if (e.kind === 'deadline') return { ...base, id: e.deadline.id, klaar: e.deadline.doneAt !== null }
  if (e.kind === 'appointment') return { ...base, id: e.appointment.id }
  return base
}

/** Notes whose title or text holds every word of [query], newest first. */
export function searchNotes(notes: Note[], query: string, limit: number): Note[] {
  const words = query.toLocaleLowerCase('nl').split(/\s+/).filter(Boolean)
  return notes
    .filter((n) => n.deletedAt === null)
    .filter((n) => {
      const hay = `${n.title}\n${n.body}`.toLocaleLowerCase('nl')
      return words.every((w) => hay.includes(w))
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
}

export const MCP_TOOLS: Tool[] = [
  {
    name: 'list_agenda',
    title: 'Agenda bekijken',
    description: 'Lessen (schoolkalender of lesrooster), deadlines, afspraken en Google Agenda van een of meer dagen, in tijdsvolgorde. Herinneringen staan alleen op het toestel en zijn hier niet te zien.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Eerste dag, YYYY-MM-DD. Standaard vandaag.' },
        days: { type: 'integer', minimum: 1, maximum: 14, description: 'Aantal dagen, standaard 1.' },
      },
      additionalProperties: false,
    },
    annotations: read,
    async run(args, data) {
      const days = int(args.days, 'days', 1, 14, 1)
      const first = dayStart(args.date, data.now)
      const [items, { calendarEvents, lessons, googleEvents }] = await Promise.all([data.lifeItems(), data.timetable()])
      const out: Json[] = []
      for (let i = 0; i < days; i++) {
        const d = new Date(first)
        d.setDate(d.getDate() + i)
        const start = d.getTime()
        const list = agendaDay({ calendarEvents, googleEvents, timetable: lessons, items, reminders: [] }, start)
        out.push({ dag: new Intl.DateTimeFormat('nl-BE', { timeZone: data.timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(start + DAY_MS / 2), items: list.map((e) => entry(e, data.timeZone)) })
      }
      return { tijdzone: data.timeZone, dagen: out }
    },
  },
  {
    name: 'list_deadlines',
    title: 'Deadlines bekijken',
    description: 'Openstaande deadlines, de vroegste eerst (ook die al voorbij zijn). Met include_done ook de afgewerkte.',
    inputSchema: {
      type: 'object',
      properties: {
        include_done: { type: 'boolean', description: 'Ook afgewerkte deadlines tonen.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Hoogstens zoveel, standaard 30.' },
      },
      additionalProperties: false,
    },
    annotations: read,
    async run(args, data) {
      const limit = int(args.limit, 'limit', 1, 100, 30)
      const all = args.include_done === true
      const list = deadlinesOf(await data.lifeItems())
        .filter((d) => all || d.doneAt === null)
        .sort((a, b) => a.dueAt - b.dueAt)
        .slice(0, limit)
      return list.map((d) => ({ id: d.id, titel: d.title, ...when(d.dueAt, data.timeZone), te_laat: d.doneAt === null && d.dueAt < data.now, klaar: d.doneAt !== null, ...(d.notes ? { notities: d.notes } : {}) }))
    },
  },
  {
    name: 'search_notes',
    title: 'Notities zoeken',
    description: 'Zoekt in de titel en tekst van je notities; alle woorden moeten voorkomen. Zonder zoekterm: de nieuwste notities. Geeft id, titel en het begin van de tekst; lees een notitie helemaal met read_note.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Zoekwoorden.' },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Hoogstens zoveel, standaard 10.' },
      },
      additionalProperties: false,
    },
    annotations: read,
    async run(args, data) {
      const query = text(args.query, 'query', 200)
      const limit = int(args.limit, 'limit', 1, 20, 10)
      return searchNotes(await data.notes(), query, limit).map((n) => ({ id: n.id, titel: noteTitle(n), begin: n.body.slice(0, 200), gewijzigd: local(n.updatedAt, data.timeZone) }))
    },
  },
  {
    name: 'read_note',
    title: 'Notitie lezen',
    description: 'De volledige titel en tekst van één notitie, met het id uit search_notes.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    annotations: read,
    async run(args, data) {
      const id = text(args.id, 'id', 100, true)
      const note = (await data.notes()).find((n) => n.id === id && n.deletedAt === null)
      if (!note) throw new ToolInputError('Die notitie bestaat niet (meer).')
      return { id: note.id, titel: noteTitle(note), tekst: note.body.slice(0, MAX_NOTE_TEXT), ...(note.body.length > MAX_NOTE_TEXT ? { ingekort: true } : {}), gewijzigd: local(note.updatedAt, data.timeZone) }
    },
  },
  {
    name: 'create_note',
    title: 'Notitie maken',
    description: 'Maakt een nieuwe notitie in NEXUS. Ze verschijnt op al je apparaten.',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string', maxLength: MAX_NOTE_TITLE }, body: { type: 'string', maxLength: MAX_NOTE_TEXT } },
      required: ['title'],
      additionalProperties: false,
    },
    annotations: create,
    async run(args, data) {
      const title = text(args.title, 'title', MAX_NOTE_TITLE, true).trim()
      const body = text(args.body, 'body', MAX_NOTE_TEXT)
      const note: Note = { id: data.newId(), title, body, updatedAt: data.now, deletedAt: null }
      await data.saveNote(note)
      return { gemaakt: 'notitie', id: note.id, titel: title }
    },
  },
  {
    name: 'create_deadline',
    title: 'Deadline toevoegen',
    description: 'Zet een deadline in de Agenda. Herinneringen gaan standaard 1 dag en 1 uur ervoor naar je gsm en horloge.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        dueAt: { type: 'string', description: 'Tijdstip met tijdzone, bv. 2026-12-03T23:59:00+01:00.' },
        notes: { type: 'string' },
        remind: { type: 'array', items: { type: 'integer', enum: [10080, 2880, 1440, 180, 60, 0] }, description: 'Minuten vooraf herinneren.' },
      },
      required: ['title', 'dueAt'],
      additionalProperties: false,
    },
    annotations: create,
    async run(args, data) {
      const parsed = parseDeadline({ title: args.title, dueAt: args.dueAt, notes: args.notes ?? '', ...(args.remind !== undefined ? { remind: args.remind } : {}) })
      if (!parsed.ok) throw new ToolInputError(parsed.error)
      const id = data.newId()
      await data.saveLifeItem({ ...parsed.value, kind: 'deadline', id, doneAt: null, updatedAt: data.now, deletedAt: null })
      return { gemaakt: 'deadline', id, titel: parsed.value.title, ...when(parsed.value.dueAt, data.timeZone) }
    },
  },
  {
    name: 'create_appointment',
    title: 'Afspraak toevoegen',
    description: 'Zet een afspraak in de Agenda, standaard een uur lang, met een herinnering een uur ervoor.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        startAt: { type: 'string', description: 'Begin met tijdzone, bv. 2026-12-03T14:00:00+01:00.' },
        endAt: { type: 'string', description: 'Einde; standaard een uur na het begin.' },
        location: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['title', 'startAt'],
      additionalProperties: false,
    },
    annotations: create,
    async run(args, data) {
      const parsed = parseAppointment({ title: args.title, startAt: args.startAt, endAt: args.endAt, location: args.location ?? '', notes: args.notes ?? '' })
      if (!parsed.ok) throw new ToolInputError(parsed.error)
      const id = data.newId()
      await data.saveLifeItem({ repeat: null, ...parsed.value, kind: 'appointment', id, updatedAt: data.now, deletedAt: null })
      return { gemaakt: 'afspraak', id, titel: parsed.value.title, begin: local(parsed.value.startAt, data.timeZone), einde: local(parsed.value.endAt, data.timeZone) }
    },
  },
]

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string }
}

const failure = (id: JsonRpcResponse['id'], code: number, message: string): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } })

/** Answers one JSON-RPC message; null for a notification (nothing to send back). */
export async function handleMcp(message: unknown, data: McpData): Promise<JsonRpcResponse | null> {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) return failure(null, -32600, 'Ongeldig verzoek.')
  const { id, method, params } = message as { id?: unknown; method?: unknown; params?: unknown }
  const rpcId = typeof id === 'string' || typeof id === 'number' ? id : null
  if (typeof method !== 'string') return failure(rpcId, -32600, 'Ongeldig verzoek.')
  // Notifications (notifications/initialized, cancelled, ...) get no answer.
  if (id === undefined) return null
  const p = (typeof params === 'object' && params !== null ? params : {}) as Json
  const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id: rpcId, result })
  switch (method) {
    case 'initialize': {
      const asked = typeof p.protocolVersion === 'string' ? p.protocolVersion : ''
      const protocolVersion = (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0]
      return ok({
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER_INFO,
        instructions:
          'NEXUS OS is the personal workspace of the signed-in user: agenda with lessons, deadlines and appointments, and notes. Answer in the language of the user (usually Dutch). Times are in the time zone given by list_agenda. Ask before creating anything the user did not ask for.',
      })
    }
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({ tools: MCP_TOOLS.map(({ run: _run, ...tool }) => tool) })
    case 'tools/call': {
      const tool = MCP_TOOLS.find((t) => t.name === p.name)
      if (!tool) return failure(rpcId, -32602, `Onbekende tool: ${String(p.name)}`)
      const args = (typeof p.arguments === 'object' && p.arguments !== null && !Array.isArray(p.arguments) ? p.arguments : {}) as Json
      try {
        const result = await tool.run(args, data)
        return ok({ content: [{ type: 'text', text: JSON.stringify(result) }] })
      } catch (err) {
        if (err instanceof ToolInputError) return ok({ content: [{ type: 'text', text: err.message }], isError: true })
        throw err
      }
    }
    default:
      return failure(rpcId, -32601, `Onbekende methode: ${method}`)
  }
}
