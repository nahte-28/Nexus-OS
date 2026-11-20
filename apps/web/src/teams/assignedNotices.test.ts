import { afterEach, describe, expect, it, vi } from 'vitest'

const shown = vi.fn(async () => {})
vi.mock('../platform/notify', () => ({ showLocalNotification: (...a: unknown[]) => shown(...(a as [])) }))
const { startAssignedNotices } = await import('./assignedNotices')

function fakeClient() {
  let onChange: ((p: { new: unknown }) => void) | null = null
  const table = (rows: Record<string, unknown>) => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.maybeSingle = async () => ({ data: rows, error: null })
    q.then = (resolve: (v: unknown) => void) => resolve({ data: [{ id: 'old' }], error: null })
    return q
  }
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'me' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: (name: string) => table(name === 'team_projects' ? { name: 'Labo' } : name === 'study_group_members' ? { display_name: 'Zoë' } : {}),
    channel: () => {
      const ch = { on: (_e: string, _f: unknown, cb: typeof onChange) => ((onChange = cb), ch), subscribe: () => ch }
      return ch
    },
    removeChannel: async () => {},
  }
  return { client, emit: (row: Record<string, unknown>) => onChange?.({ new: row }) }
}

const row = (extra: Record<string, unknown> = {}) => ({ id: 't1', project_id: 'p1', group_id: 'g1', title: 'Verslag', status: 'todo', assignee: 'me', updated_by: 'z', ...extra })

describe('notice for a new team task', () => {
  afterEach(() => shown.mockClear())

  it('tells you once when a teammate puts a task on your name', async () => {
    const { client, emit } = fakeClient()
    const stop = startAssignedNotices(client as never, () => true)
    await vi.waitFor(() => expect(client.channel).toBeDefined())
    await new Promise((r) => setTimeout(r, 0))
    emit(row())
    await vi.waitFor(() => expect(shown).toHaveBeenCalledWith('Nieuwe teamtaak voor jou', 'Zoë zette "Verslag" (Labo) op jouw naam.', 'team-task:t1'))
    emit(row({ status: 'doing' }))
    emit(row({ id: 'old' }))
    emit(row({ id: 't2', updated_by: 'me' }))
    await new Promise((r) => setTimeout(r, 0))
    expect(shown).toHaveBeenCalledTimes(1)
    stop()
  })
})
