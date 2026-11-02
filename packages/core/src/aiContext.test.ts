import { describe, expect, it } from 'vitest'
import { addApproval, AI_MODULES, allowedTools, approvalCounts, filterApprovals, fullAiContext, hiddenModules, MAX_APPROVALS, parseAiContext, parseApprovals, toolModule, type ApprovalEntry } from './aiContext'

const entry = (n: number, patch: Partial<ApprovalEntry> = {}): ApprovalEntry => ({ id: `e${n}`, at: n, source: 'ai', outcome: 'allowed', label: 'Notitie maken', detail: 'Een notitie maken.', ...patch })

describe('AI context per module', () => {
  it('has every module on by default and keeps unknown keys out', () => {
    expect(Object.values(fullAiContext()).every(Boolean)).toBe(true)
    expect(parseAiContext({ notes: false, finance: 'nee', extra: true })).toEqual({ ...fullAiContext(), notes: false })
    expect(parseAiContext(null)).toEqual(fullAiContext())
  })

  it('gives every action exactly one module', () => {
    const tools = AI_MODULES.flatMap((m) => m.tools)
    expect(new Set(tools).size).toBe(tools.length)
    expect(toolModule('search_notes')).toBe('notes')
    expect(toolModule('send_to_phone')).toBe('devices')
    expect(toolModule('unknown')).toBeNull()
  })

  it('leaves out the actions and names of switched-off modules', () => {
    const context = { ...fullAiContext(), notes: false, agenda: false }
    expect(allowedTools(context)).not.toContain('search_notes')
    expect(allowedTools(context)).not.toContain('create_deadline')
    expect(allowedTools(context)).toContain('create_reminder')
    expect(hiddenModules(context)).toEqual(['Notities', 'Agenda en lesrooster'])
    expect(hiddenModules(fullAiContext())).toEqual([])
  })
})

describe('approval history', () => {
  it('keeps the newest first, without doubles, and at most the limit', () => {
    let list: ApprovalEntry[] = []
    for (let i = 0; i < MAX_APPROVALS + 5; i++) list = addApproval(list, entry(i))
    expect(list).toHaveLength(MAX_APPROVALS)
    expect(list[0].id).toBe(`e${MAX_APPROVALS + 4}`)
    expect(addApproval(list, entry(MAX_APPROVALS + 4, { outcome: 'denied' }))[0].outcome).toBe('denied')
    expect(addApproval(list, entry(MAX_APPROVALS + 4)).filter((e) => e.id === `e${MAX_APPROVALS + 4}`)).toHaveLength(1)
  })

  it('reads stored entries and drops broken ones', () => {
    expect(parseApprovals([entry(1), entry(2), { id: 'x', at: 3, source: 'ai', outcome: 'maybe', label: '', detail: '' }, 'junk'])).toEqual([entry(2), entry(1)])
    expect(parseApprovals('junk')).toEqual([])
  })

  it('filters and counts', () => {
    const list = [entry(1), entry(2, { outcome: 'denied' }), entry(3, { source: 'intelligence', outcome: 'dismissed' }), entry(4, { source: 'intelligence', outcome: 'snoozed' }), entry(5, { outcome: 'blocked' }), entry(6, { outcome: 'auto' })]
    expect(filterApprovals(list, 'intelligence').map((e) => e.id)).toEqual(['e3', 'e4'])
    expect(filterApprovals(list, 'denied').map((e) => e.id)).toEqual(['e2', 'e3', 'e5'])
    expect(filterApprovals(list, 'all')).toHaveLength(6)
    expect(approvalCounts(list)).toEqual({ yes: 2, no: 3, other: 1 })
  })
})
