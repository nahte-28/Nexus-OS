import { appointmentsOf, openDeadlines, parseAppointment, parseDeadline, parseReminder, REPEAT_LABELS, TARGET_LABELS, type Note, type ThemeId } from '@nexus/core'
import { phonesOf, type ConnectEngine } from '../connect/engine'
import type { LifeStore } from '../life/store'
import type { RemindersStore } from '../reminders/store'

/** What the assistant's actions may touch. Passed in, so tests can use fakes. */
export interface ToolContext {
  notes: { getSnapshot(): Note[]; add(): string; update(id: string, patch: { title?: string; body?: string }): void }
  reminders: Pick<RemindersStore, 'getSnapshot' | 'add' | 'remove'>
  life: Pick<LifeStore, 'getSnapshot' | 'addDeadline' | 'addAppointment'>
  connect: Pick<ConnectEngine, 'getSnapshot' | 'notifyPhones'>
  setTheme(theme: ThemeId): void
  now(): number
}

export interface ToolSpec {
  /** Short name on the permission card and in "always allow". */
  label: string
  /** True when the action only reads; it is still asked, but shown as lower impact. */
  readOnly: boolean
  /** One sentence about what will happen, shown before the user allows it. */
  describe(input: Record<string, unknown>): string
  /** An error text when the input cannot be run, else null. */
  validate(input: Record<string, unknown>, ctx: ToolContext): string | null
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<string>
}

const MAX_NOTE_RESULTS = 10
const MAX_NOTE_CHARS = 1500

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function when(at: number): string {
  return new Date(at).toLocaleString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

function phones(ctx: ToolContext) {
  return phonesOf(ctx.connect.getSnapshot())
}

export const TOOL_SPECS: Record<string, ToolSpec> = {
  search_notes: {
    label: 'Notities lezen',
    readOnly: true,
    describe: (input) => (str(input.query)?.trim() ? `Je notities doorzoeken op "${str(input.query)!.trim()}".` : 'Je recentste notities lezen.'),
    validate: (input) => (input.query === undefined || typeof input.query === 'string' ? null : 'query moet tekst zijn.'),
    run: async (input, ctx) => {
      const words = (str(input.query) ?? '').toLowerCase().split(/\s+/).filter(Boolean)
      const notes = ctx.notes
        .getSnapshot()
        .filter((n) => {
          const haystack = `${n.title}\n${n.body}`.toLowerCase()
          return words.every((w) => haystack.includes(w))
        })
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_NOTE_RESULTS)
      if (notes.length === 0) return words.length ? 'Geen notities gevonden met die woorden.' : 'Er zijn nog geen notities.'
      return JSON.stringify(
        notes.map((n) => ({
          id: n.id,
          title: n.title || '(zonder titel)',
          body: n.body.length > MAX_NOTE_CHARS ? `${n.body.slice(0, MAX_NOTE_CHARS)}…` : n.body,
          updated: new Date(n.updatedAt).toISOString(),
        })),
      )
    },
  },

  create_note: {
    label: 'Notitie maken',
    readOnly: false,
    describe: (input) => `Een notitie "${str(input.title) ?? ''}" maken.`,
    validate: (input) =>
      typeof input.title !== 'string' || typeof input.body !== 'string'
        ? 'title en body moeten tekst zijn.'
        : !input.title.trim() && !input.body.trim()
          ? 'De notitie is leeg.'
          : null,
    run: async (input, ctx) => {
      const id = ctx.notes.add()
      ctx.notes.update(id, { title: str(input.title)!.trim().slice(0, 200), body: str(input.body)! })
      return `Notitie aangemaakt (id ${id}).`
    },
  },

  list_reminders: {
    label: 'Herinneringen bekijken',
    readOnly: true,
    describe: () => 'Je geplande herinneringen bekijken.',
    validate: () => null,
    run: async (_input, ctx) => {
      const list = ctx.reminders.getSnapshot()
      if (list.length === 0) return 'Er zijn geen herinneringen gepland.'
      return JSON.stringify(
        list.map((r) => ({
          id: r.id,
          title: r.title,
          at: new Date(r.at).toISOString(),
          repeat: r.repeat,
          target: r.target,
        })),
      )
    },
  },

  create_reminder: {
    label: 'Herinnering plannen',
    readOnly: false,
    describe: (input) => {
      const parsed = parseReminder(input, Date.now())
      if (!parsed.ok) return `Een herinnering "${str(input.title) ?? ''}" plannen.`
      const { title, at, repeat, target } = parsed.value
      return `"${title}" plannen op ${when(at)} (${REPEAT_LABELS[repeat].toLowerCase()}, ${TARGET_LABELS[target].toLowerCase()}).`
    },
    validate: (input, ctx) => {
      const parsed = parseReminder(input, ctx.now())
      return parsed.ok ? null : parsed.error
    },
    run: async (input, ctx) => {
      const parsed = parseReminder(input, ctx.now())
      if (!parsed.ok) throw new Error(parsed.error)
      const reminder = await ctx.reminders.add(parsed.value, ctx.now())
      const warning =
        reminder.target === 'phone' && phones(ctx).length === 0 ? ' Let op: er is nog geen gsm gekoppeld, dus ze verschijnt alleen hier.' : ''
      return `Gepland op ${when(reminder.at)} (id ${reminder.id}).${warning}`
    },
  },

  delete_reminder: {
    label: 'Herinnering verwijderen',
    readOnly: false,
    describe: (input) => `Een herinnering verwijderen (${str(input.id) ?? '?'}).`,
    validate: (input, ctx) =>
      typeof input.id !== 'string'
        ? 'id moet tekst zijn.'
        : ctx.reminders.getSnapshot().some((r) => r.id === input.id)
          ? null
          : 'Geen herinnering met dat id. Gebruik eerst list_reminders.',
    run: async (input, ctx) => ((await ctx.reminders.remove(str(input.id)!)) ? 'Verwijderd.' : 'Niet gevonden.'),
  },

  list_agenda: {
    label: 'Agenda bekijken',
    readOnly: true,
    describe: () => 'Je open deadlines en komende afspraken bekijken.',
    validate: () => null,
    run: async (_input, ctx) => {
      const items = ctx.life.getSnapshot()
      const deadlines = openDeadlines(items).map((d) => ({ type: 'deadline', title: d.title, due: new Date(d.dueAt).toISOString() }))
      const appointments = appointmentsOf(items)
        .filter((a) => a.endAt >= ctx.now())
        .map((a) => ({ type: 'afspraak', title: a.title, start: new Date(a.startAt).toISOString(), end: new Date(a.endAt).toISOString(), location: a.location || undefined }))
      const all = [...deadlines, ...appointments].slice(0, 60)
      return all.length ? JSON.stringify(all) : 'Geen open deadlines of komende afspraken.'
    },
  },

  create_deadline: {
    label: 'Deadline toevoegen',
    readOnly: false,
    describe: (input) => {
      const parsed = parseDeadline({ ...input, projectId: null, notes: str(input.notes) ?? '' })
      return parsed.ok ? `Deadline "${parsed.value.title}" toevoegen tegen ${when(parsed.value.dueAt)}.` : `Een deadline "${str(input.title) ?? ''}" toevoegen.`
    },
    validate: (input) => {
      const parsed = parseDeadline({ ...input, projectId: null, notes: str(input.notes) ?? '' })
      return parsed.ok ? null : parsed.error
    },
    run: async (input, ctx) => {
      const parsed = parseDeadline({ ...input, projectId: null, notes: str(input.notes) ?? '' })
      if (!parsed.ok) throw new Error(parsed.error)
      await ctx.life.addDeadline(parsed.value, ctx.now())
      return `Deadline toegevoegd in de Agenda, tegen ${when(parsed.value.dueAt)}.`
    },
  },

  create_appointment: {
    label: 'Afspraak toevoegen',
    readOnly: false,
    describe: (input) => {
      const parsed = parseAppointment(input)
      return parsed.ok ? `Afspraak "${parsed.value.title}" toevoegen op ${when(parsed.value.startAt)}.` : `Een afspraak "${str(input.title) ?? ''}" toevoegen.`
    },
    validate: (input) => {
      const parsed = parseAppointment(input)
      return parsed.ok ? null : parsed.error
    },
    run: async (input, ctx) => {
      const parsed = parseAppointment(input)
      if (!parsed.ok) throw new Error(parsed.error)
      await ctx.life.addAppointment(parsed.value, ctx.now())
      return `Afspraak toegevoegd in de Agenda, op ${when(parsed.value.startAt)}.`
    },
  },

  send_to_phone: {
    label: 'Melding naar gsm sturen',
    readOnly: false,
    describe: (input) => `Nu een melding "${str(input.title) ?? ''}" naar je gsm en horloge sturen.`,
    validate: (input, ctx) =>
      typeof input.title !== 'string' || !input.title.trim()
        ? 'title is verplicht.'
        : input.text !== undefined && typeof input.text !== 'string'
          ? 'text moet tekst zijn.'
          : phones(ctx).length === 0
            ? 'Er is geen gsm gekoppeld, of NEXUS Connect is niet verbonden.'
            : null,
    run: async (input, ctx) => {
      const targets = phones(ctx)
      await ctx.connect.notifyPhones(str(input.title)!, str(input.text))
      return `Verstuurd naar ${targets.map((p) => p.name).join(', ')}.`
    },
  },

  set_theme: {
    label: 'Thema wisselen',
    readOnly: false,
    describe: (input) => `Het thema wisselen naar ${input.theme === 'pulse' ? 'Pulse' : 'Focus'}.`,
    validate: (input) => (input.theme === 'focus' || input.theme === 'pulse' ? null : 'theme moet focus of pulse zijn.'),
    run: async (input, ctx) => {
      ctx.setTheme(input.theme as ThemeId)
      return `Thema is nu ${input.theme === 'pulse' ? 'Pulse' : 'Focus'}.`
    },
  },
}
