import { describe, expect, it } from 'vitest'
import type { LifeItem } from './life'
import { handleMcp, MCP_TOOLS, searchNotes, type McpData } from './mcp'
import type { Note } from './notes'

process.env.TZ = 'Europe/Brussels'

const NOW = Date.parse('2026-11-27T09:00:00+01:00')

function fakeData(items: LifeItem[] = [], notes: Note[] = []) {
  const saved: { notes: Note[]; items: LifeItem[] } = { notes: [], items: [] }
  let n = 0
  const data: McpData = {
    now: NOW,
    timeZone: 'Europe/Brussels',
    newId: () => `id-${++n}`,
    lifeItems: async () => items,
    timetable: async () => ({ calendarEvents: [], lessons: [{ id: 'l1', day: 5, start: '10:00', end: '11:40', subject: 'Linux', room: 'B2.04' }], googleEvents: [] }),
    notes: async () => notes,
    saveNote: async (note) => void saved.notes.push(note),
    saveLifeItem: async (item) => void saved.items.push(item),
  }
  return { data, saved }
}

const call = (data: McpData, name: string, args: Record<string, unknown> = {}) => handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, data)
const body = (r: Awaited<ReturnType<typeof call>>) => JSON.parse((r!.result as { content: [{ text: string }] }).content[0].text)

const deadline = (id: string, title: string, dueAt: number, doneAt: number | null = null): LifeItem => ({ kind: 'deadline', id, title, dueAt, projectId: null, notes: '', doneAt, remind: [], target: 'phone', updatedAt: 1, deletedAt: null })

describe('handleMcp protocol', () => {
  it('negotiates the protocol version and says what it can do', async () => {
    const { data } = fakeData()
    const r = await handleMcp({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, data)
    expect(r?.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'nexus-os' } })
    const old = await handleMcp({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2023-01-01' } }, data)
    expect((old?.result as { protocolVersion: string }).protocolVersion).toBe('2025-11-25')
  })

  it('answers no notification and rejects unknown methods and odd messages', async () => {
    const { data } = fakeData()
    expect(await handleMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, data)).toBeNull()
    expect((await handleMcp({ jsonrpc: '2.0', id: 2, method: 'resources/list' }, data))?.error?.code).toBe(-32601)
    expect((await handleMcp([{ jsonrpc: '2.0', id: 1, method: 'ping' }], data))?.error?.code).toBe(-32600)
    expect((await call(data, 'delete_everything'))?.error?.code).toBe(-32602)
  })

  it('lists every tool without its implementation, read tools marked read-only', async () => {
    const { data } = fakeData()
    const r = await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, data)
    const tools = (r?.result as { tools: Array<Record<string, unknown>> }).tools
    expect(tools.map((t) => t.name)).toEqual(MCP_TOOLS.map((t) => t.name))
    expect(tools.every((t) => !('run' in t))).toBe(true)
    for (const t of tools) expect((t.annotations as { readOnlyHint: boolean }).readOnlyHint).toBe(!String(t.name).startsWith('create_'))
  })
})

describe('MCP tools', () => {
  it('shows lessons and deadlines of a day in Brussels time', async () => {
    const { data } = fakeData([deadline('d1', 'Verslag Linux', Date.parse('2026-11-27T23:59:00+01:00'))])
    const r = body(await call(data, 'list_agenda'))
    expect(r.dagen).toHaveLength(1)
    expect(r.dagen[0].items.map((i: { soort: string; titel: string }) => `${i.soort}:${i.titel}`)).toEqual(['lesson:Linux', 'deadline:Verslag Linux'])
    expect(r.dagen[0].items[0].lokaal).toContain('10:00')
  })

  it('lists open deadlines first to last, overdue marked, done ones only on request', async () => {
    const { data } = fakeData([deadline('a', 'Te laat', NOW - 3600_000), deadline('b', 'Later', NOW + 86400_000), deadline('c', 'Klaar', NOW, NOW)])
    expect(body(await call(data, 'list_deadlines')).map((d: { titel: string; te_laat: boolean }) => [d.titel, d.te_laat])).toEqual([
      ['Te laat', true],
      ['Later', false],
    ])
    expect(body(await call(data, 'list_deadlines', { include_done: true }))).toHaveLength(3)
  })

  it('finds notes on every word and reads one in full', async () => {
    const notes: Note[] = [
      { id: 'n1', title: 'Linux examen', body: 'chmod en chown herhalen', updatedAt: 2, deletedAt: null },
      { id: 'n2', title: 'Boodschappen', body: 'melk', updatedAt: 3, deletedAt: null },
      { id: 'n3', title: 'Weg', body: 'linux', updatedAt: 4, deletedAt: 5 },
    ]
    expect(searchNotes(notes, 'LINUX chmod', 10).map((n) => n.id)).toEqual(['n1'])
    const { data } = fakeData([], notes)
    expect(body(await call(data, 'search_notes', { query: 'linux' })).map((n: { id: string }) => n.id)).toEqual(['n1'])
    expect(body(await call(data, 'read_note', { id: 'n1' })).tekst).toBe('chmod en chown herhalen')
    const gone = await call(data, 'read_note', { id: 'n3' })
    expect((gone?.result as { isError: boolean }).isError).toBe(true)
  })

  it('creates a note and a deadline with the same checks as the app', async () => {
    const { data, saved } = fakeData()
    expect(body(await call(data, 'create_note', { title: ' Idee ', body: 'tekst' }))).toMatchObject({ gemaakt: 'notitie', titel: 'Idee' })
    expect(saved.notes[0]).toMatchObject({ title: 'Idee', body: 'tekst', updatedAt: NOW, deletedAt: null })

    const made = body(await call(data, 'create_deadline', { title: 'Taak web', dueAt: '2026-12-03T23:59:00+01:00' }))
    expect(made.gemaakt).toBe('deadline')
    expect(saved.items[0]).toMatchObject({ kind: 'deadline', title: 'Taak web', remind: [1440, 60], target: 'phone', doneAt: null })

    const bad = await call(data, 'create_deadline', { title: 'X', dueAt: 'morgen' })
    expect((bad?.result as { isError: boolean }).isError).toBe(true)
    const noTitle = await call(data, 'create_note', { title: '   ' })
    expect((noTitle?.result as { isError: boolean }).isError).toBe(true)
    expect(saved.items).toHaveLength(1)
    expect(saved.notes).toHaveLength(1)
  })

  it('creates an appointment of an hour by default', async () => {
    const { data, saved } = fakeData()
    await call(data, 'create_appointment', { title: 'Tandarts', startAt: '2026-12-02T14:00:00+01:00' })
    const a = saved.items[0] as Extract<LifeItem, { kind: 'appointment' }>
    expect(a.endAt - a.startAt).toBe(3600_000)
    expect(a.repeat).toBeNull()
  })
})
