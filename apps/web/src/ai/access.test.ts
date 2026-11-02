import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fullAiContext, type AiContext, type ApprovalEntry } from '@nexus/core'
import { AiContextStore, ApprovalLog } from './context'
import { AssistantSession, alwaysAllowedList, forgetAlways, forgetAlwaysAllowed, type Transport } from './session'
import type { ToolContext } from './tools'

type Turn = { content: unknown[]; stop_reason: string }

function scripted(turns: Turn[]) {
  const sent: Array<{ text: string; tools: string[] | undefined }> = []
  const transport: Transport = async (messages, onEvent, tools) => {
    sent.push({ text: JSON.stringify(messages), tools })
    const turn = turns.shift()!
    onEvent({ type: 'done', message: { role: 'assistant', content: turn.content as never, stop_reason: turn.stop_reason, model: 'm', usage: { input_tokens: 1, output_tokens: 1 } } })
  }
  return { transport, sent }
}

const notes = [{ id: 'n1', title: 'School', body: 'Napoleon', updatedAt: 1, deletedAt: null }]
const ctx = { notes: { getSnapshot: () => notes, add: () => 'x', update: () => {} }, now: () => Date.parse('2026-11-02T10:00:00+01:00') } as unknown as ToolContext
const toolUse = (id: string, name: string, input: unknown = {}) => ({ type: 'tool_use', id, name, input })

function session(turns: Turn[], context: AiContext) {
  const log: Array<Omit<ApprovalEntry, 'id' | 'at'>> = []
  const { transport, sent } = scripted(turns)
  const s = new AssistantSession(transport, () => ctx, { context: () => context, log: (e) => log.push(e) })
  return { s, sent, log }
}

describe('what NEXUS AI may see', () => {
  beforeEach(() => forgetAlwaysAllowed())

  it('sends only the actions of modules that are on, and names the modules that are off', async () => {
    const { s, sent } = session([{ content: [{ type: 'text', text: 'Ok' }], stop_reason: 'end_turn' }], { ...fullAiContext(), notes: false })
    await s.send('Wat staat er in mijn notities?')
    expect(sent[0].tools).not.toContain('search_notes')
    expect(sent[0].tools).toContain('create_reminder')
    expect(sent[0].text).toContain('Uitgezet voor NEXUS AI: Notities')
  })

  it('blocks an action of a switched-off module without asking, and writes it down', async () => {
    const { s, sent, log } = session(
      [
        { content: [toolUse('t1', 'search_notes')], stop_reason: 'tool_use' },
        { content: [{ type: 'text', text: 'Dat mag ik niet zien.' }], stop_reason: 'end_turn' },
      ],
      { ...fullAiContext(), notes: false },
    )
    await s.send('Zoek in mijn notities')
    expect(s.getSnapshot().items.find((i) => i.kind === 'tool')).toMatchObject({ request: { status: 'denied', result: 'Deze module staat uit voor NEXUS AI.' } })
    expect(sent[1].text).not.toContain('Napoleon')
    expect(log).toEqual([{ source: 'ai', outcome: 'blocked', label: 'Notities lezen', detail: 'Je recentste notities lezen.' }])
  })

  it('writes every answer on a permission card in the history', async () => {
    const { s, log } = session(
      [
        { content: [toolUse('t1', 'search_notes')], stop_reason: 'tool_use' },
        { content: [toolUse('t2', 'search_notes')], stop_reason: 'tool_use' },
        { content: [toolUse('t3', 'search_notes')], stop_reason: 'tool_use' },
        { content: [{ type: 'text', text: 'Klaar' }], stop_reason: 'end_turn' },
      ],
      fullAiContext(),
    )
    const done = s.send('Zoek')
    const pending = (id: string) => vi.waitFor(() => expect(s.getSnapshot().items.some((i) => i.kind === 'tool' && i.request.id === id && i.request.status === 'pending')).toBe(true))
    await pending('t1')
    s.decide('t1', false)
    await pending('t2')
    s.decide('t2', true, true)
    await done
    expect(log.map((e) => e.outcome)).toEqual(['denied', 'always', 'auto'])
    expect(alwaysAllowedList()).toEqual(['search_notes'])
    forgetAlways('search_notes')
    expect(alwaysAllowedList()).toEqual([])
  })

  it('starts a new conversation when the settings change', async () => {
    const { s } = session([{ content: [{ type: 'text', text: 'Ok' }], stop_reason: 'end_turn' }], fullAiContext())
    s.contextChanged()
    expect(s.getSnapshot().items).toEqual([])
    await s.send('Hoi')
    s.contextChanged()
    expect(s.getSnapshot().items).toMatchObject([{ kind: 'notice', text: /nieuw gesprek/ }])
  })
})

describe('stores', () => {
  it('keeps the module choices and the history on the device', () => {
    localStorage.clear()
    const a = new AiContextStore()
    a.set('finance', false)
    expect(new AiContextStore().getSnapshot().finance).toBe(false)
    const log = new ApprovalLog()
    log.add({ source: 'ai', outcome: 'allowed', label: 'L', detail: 'D', at: 5 })
    expect(new ApprovalLog().getSnapshot()).toMatchObject([{ label: 'L', at: 5 }])
    log.clear()
    expect(new ApprovalLog().getSnapshot()).toEqual([])
  })
})
