import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LifeItem, Note, Reminder, ReminderDraft } from '@nexus/core'
import { AssistantSession, forgetAlwaysAllowed, type Transport } from './session'
import { TOOL_SPECS, type ToolContext } from './tools'
import { TOOLS } from '../../../../api/ai'

type Sent = Parameters<Transport>[0]

/** A transport that answers with scripted assistant turns and records what it was sent. */
function scripted(turns: Array<{ content: unknown[]; stop_reason: string } | Error>) {
  const sent: Sent[] = []
  const transport: Transport = async (messages, onEvent) => {
    sent.push(structuredClone(messages))
    const turn = turns.shift()
    if (!turn) throw new Error('no more turns')
    if (turn instanceof Error) throw turn
    for (const b of turn.content as Array<{ type: string; text?: string }>) if (b.type === 'text') onEvent({ type: 'text', text: b.text! })
    onEvent({
      type: 'done',
      message: { role: 'assistant', content: turn.content as never, stop_reason: turn.stop_reason, model: 'claude-test', usage: { input_tokens: 10, output_tokens: 5 } },
    })
  }
  return { transport, sent }
}

function fakeContext(now = Date.parse('2026-10-19T12:00:00+02:00')) {
  const notes: Note[] = [{ id: 'n1', title: 'School', body: 'Verslag over Napoleon', updatedAt: 1, deletedAt: null }]
  const reminders: Reminder[] = []
  const life: LifeItem[] = []
  const sent: Array<{ deviceId: string; title: string; text?: string }> = []
  let theme = 'focus'
  const ctx: ToolContext = {
    notes: {
      getSnapshot: () => notes,
      add: () => {
        notes.push({ id: `n${notes.length + 1}`, title: '', body: '', updatedAt: now, deletedAt: null })
        return notes[notes.length - 1].id
      },
      update: (id, patch) => Object.assign(notes.find((n) => n.id === id)!, patch),
    },
    reminders: {
      getSnapshot: () => reminders,
      add: async (draft: ReminderDraft) => {
        const r = { ...draft, id: `r${reminders.length + 1}`, createdAt: now }
        reminders.push(r)
        return r
      },
      remove: async (id: string) => reminders.splice(reminders.findIndex((r) => r.id === id), 1).length > 0,
    },
    life: {
      getSnapshot: () => life,
      addDeadline: async (draft) => {
        life.push({ ...draft, kind: 'deadline', id: `d${life.length + 1}`, doneAt: null, updatedAt: now, deletedAt: null })
        return life[life.length - 1].id
      },
      addAppointment: async (draft) => {
        life.push({ ...draft, kind: 'appointment', id: `a${life.length + 1}`, updatedAt: now, deletedAt: null })
        return life[life.length - 1].id
      },
    },
    connect: {
      getSnapshot: () =>
        ({
          status: 'ready',
          devices: [{ id: 'phone', name: 'OnePlus 15R', platform: 'android', revokedAt: null }],
        }) as never,
      notifyPhones: async (title: string, text?: string) => {
        sent.push({ deviceId: 'phone', title, text })
      },
    },
    setTheme: (t) => (theme = t),
    now: () => now,
  }
  return { ctx, notes, reminders, life, sent, theme: () => theme }
}

const toolUse = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input })

describe('AssistantSession', () => {
  beforeEach(() => forgetAlwaysAllowed())

  it('has a local action for every tool the server offers', () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(Object.keys(TOOL_SPECS).sort())
  })

  it('streams an answer and sends the current time with the question', async () => {
    const { transport, sent } = scripted([{ content: [{ type: 'text', text: 'Hallo Ethan!' }], stop_reason: 'end_turn' }])
    const session = new AssistantSession(transport, () => fakeContext().ctx)
    await session.send('Hoi')
    expect(session.getSnapshot().items.map((i) => i.kind)).toEqual(['user', 'assistant'])
    expect(JSON.stringify(sent[0][0])).toContain('[Nu:')
    expect(session.getSnapshot().usage[0]).toMatchObject({ model: 'claude-test', inputTokens: 10 })
  })

  it('runs an action only after the user allows it, then continues the conversation', async () => {
    const fake = fakeContext()
    const { transport, sent } = scripted([
      {
        content: [{ type: 'thinking', thinking: '', signature: 'sig' }, toolUse('t1', 'create_reminder', { title: 'Verslag', at: '2026-10-20T09:00:00+02:00' })],
        stop_reason: 'tool_use',
      },
      { content: [{ type: 'text', text: 'Gepland!' }], stop_reason: 'end_turn' },
    ])
    const session = new AssistantSession(transport, () => fake.ctx)
    const done = session.send('Herinner me morgen om 9u aan mijn verslag')
    await vi.waitFor(() => expect(session.getSnapshot().items.some((i) => i.kind === 'tool' && i.request.status === 'pending')).toBe(true))
    expect(fake.reminders).toHaveLength(0)

    session.decide('t1', true)
    await done
    expect(fake.reminders).toMatchObject([{ title: 'Verslag', target: 'phone', repeat: 'none' }])
    // The second request carries the unchanged assistant turn (thinking included) and the result.
    const second = sent[1]
    expect(second[1]).toMatchObject({ role: 'assistant', content: [{ type: 'thinking', signature: 'sig' }, { type: 'tool_use', id: 't1' }] })
    expect(second[2]).toMatchObject({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1' }] })
    expect(session.getSnapshot().items.at(-1)).toMatchObject({ kind: 'assistant', text: 'Gepland!' })
  })

  it('reports a refusal of the user and remembers "always allow"', async () => {
    const fake = fakeContext()
    const { transport, sent } = scripted([
      { content: [toolUse('t1', 'set_theme', { theme: 'pulse' })], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'Oké, niet gewisseld.' }], stop_reason: 'end_turn' },
      { content: [toolUse('t2', 'set_theme', { theme: 'pulse' })], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'Gewisseld.' }], stop_reason: 'end_turn' },
      { content: [toolUse('t3', 'set_theme', { theme: 'focus' })], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'Terug naar Focus.' }], stop_reason: 'end_turn' },
    ])
    const session = new AssistantSession(transport, () => fake.ctx)
    const pending = () => session.getSnapshot().items.some((i) => i.kind === 'tool' && i.request.status === 'pending')

    let done = session.send('Pulse aub')
    await vi.waitFor(() => expect(pending()).toBe(true))
    session.decide('t1', false)
    await done
    expect(fake.theme()).toBe('focus')
    expect(sent[1][2]).toMatchObject({ content: [{ type: 'tool_result', is_error: true, content: 'De gebruiker weigerde deze actie.' }] })

    done = session.send('Toch wel')
    await vi.waitFor(() => expect(pending()).toBe(true))
    session.decide('t2', true, true)
    await done
    expect(fake.theme()).toBe('pulse')

    // Allowed for good: no card this time.
    await session.send('En terug')
    expect(fake.theme()).toBe('focus')
  })

  it('rejects invalid input without asking and keeps the history valid after an error', async () => {
    const fake = fakeContext()
    const { transport, sent } = scripted([
      { content: [toolUse('t1', 'create_reminder', { title: 'Oud', at: '2020-01-01T09:00:00Z' })], stop_reason: 'tool_use' },
      new Error('Netwerk weg'),
      { content: [{ type: 'text', text: 'Daar ben ik weer.' }], stop_reason: 'end_turn' },
    ])
    const session = new AssistantSession(transport, () => fake.ctx)
    await session.send('Plan iets in het verleden')
    expect(session.getSnapshot().items.some((i) => i.kind === 'tool' && i.request.status === 'failed')).toBe(true)
    expect(session.getSnapshot().items.at(-1)).toMatchObject({ kind: 'notice', text: 'Netwerk weg', error: true })

    await session.send('Hallo?')
    // The failed exchange was dropped, so the conversation starts with the new question.
    expect(sent[2]).toHaveLength(1)
    expect(sent[2][0]).toMatchObject({ role: 'user' })
  })

  it('searches notes and sends to the phone through the tools', async () => {
    const fake = fakeContext()
    expect(await TOOL_SPECS.search_notes.run({ query: 'napoleon' }, fake.ctx)).toContain('School')
    expect(await TOOL_SPECS.search_notes.run({ query: 'wiskunde' }, fake.ctx)).toContain('Geen notities')
    await TOOL_SPECS.send_to_phone.run({ title: 'Sleutels!' }, fake.ctx)
    expect(fake.sent).toEqual([{ deviceId: 'phone', title: 'Sleutels!', text: undefined }])
    expect(TOOL_SPECS.create_note.validate({ title: 'x' }, fake.ctx)).not.toBeNull()
  })

  it('puts deadlines and appointments in the Agenda', async () => {
    const { ctx, life } = fakeContext()
    expect(TOOL_SPECS.create_deadline.validate({ title: 'Verslag', dueAt: 'morgen' }, ctx)).toMatch(/Onbekend tijdstip/)
    await TOOL_SPECS.create_deadline.run({ title: 'Verslag', dueAt: '2026-11-03T23:59:00+01:00' }, ctx)
    await TOOL_SPECS.create_appointment.run({ title: 'Tandarts', startAt: '2026-10-21T14:00:00+02:00', location: 'Antwerpen' }, ctx)
    expect(life.map((i) => i.kind)).toEqual(['deadline', 'appointment'])
    expect(life[1]).toMatchObject({ endAt: Date.parse('2026-10-21T15:00:00+02:00'), location: 'Antwerpen', remind: [60] })
    const agenda = JSON.parse(await TOOL_SPECS.list_agenda.run({}, ctx)) as Array<{ title: string }>
    expect(agenda.map((a) => a.title)).toEqual(['Verslag', 'Tandarts'])
  })
})
